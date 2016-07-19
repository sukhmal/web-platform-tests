(function(){

    // Save platform functions that will be modified
    var _requestMediaKeySystemAccess = navigator.requestMediaKeySystemAccess.bind( navigator ),
        _setMediaKeys = HTMLMediaElement.prototype.setMediaKeys;
 
    // Allow us to modify the target of Events
    Object.defineProperties( Event.prototype, {
        target: {   get: function() { return this._target || this.currentTarget; },
                    set: function( newtarget ) { this._target = newtarget; } }
    } );
 
    var EventTarget = function(){
        this.listeners = {};
    };
 
    EventTarget.prototype.listeners = null;
 
    EventTarget.prototype.addEventListener = function(type, callback){
      if(!(type in this.listeners)) {
        this.listeners[type] = [];
      }
      this.listeners[type].push(callback);
    };
 
    EventTarget.prototype.removeEventListener = function(type, callback){
      if(!(type in this.listeners)) {
        return;
      }
      var stack = this.listeners[type];
      for(var i = 0, l = stack.length; i < l; i++){
        if(stack[i] === callback){
          stack.splice(i, 1);
          return this.removeEventListener(type, callback);
        }
      }
    };
 
    EventTarget.prototype.dispatchEvent = function(event){
      if(!(event.type in this.listeners)) {
        return;
      }
      var stack = this.listeners[event.type];
      event.target = this;
      for(var i = 0, l = stack.length; i < l; i++) {
        stack[i].call(this, event);
      }
    };
 
    function MediaKeySystemAccessProxy( keysystem, access, configuration )
    {
        this._keysystem = keysystem;
        this._access = access;
        this._configuration = configuration;
    }
 
    Object.defineProperties( MediaKeySystemAccessProxy.prototype, {
        keysystem: { get: function() { return this._keysystem; } }
    });
 
    MediaKeySystemAccessProxy.prototype.getConfiguration = function getConfiguration()
    {
        return this._configuration;
    };
 
    MediaKeySystemAccessProxy.prototype.createMediaKeys = function createMediaKeys()
    {
        return new Promise( function( resolve, reject ) {
        
            this._access.createMediaKeys()
            .then( function( mediaKeys ) { resolve( new MediaKeysProxy( mediaKeys ) ); })
            .catch( function( error ) { reject( error ); } );
        
        }.bind( this ) );
    };
 
    function MediaKeysProxy( mediaKeys )
    {
        this._mediaKeys = mediaKeys;
        this._sessions = [ ];
    }
 
    MediaKeysProxy.prototype._setVideoElement = function _setVideoElement( videoElement )
    {
        if ( this._videoElement )
        {
            this._sessions.forEach( function( session ) { session._unlisten(); } );
            delete this._videoElement;
        }
 
        if ( videoElement )
        {
            this._videoElement = videoElement;
            this._sessions.forEach( function( session ) { session._listen( videoElement ); } );
        }
    };
 
    MediaKeysProxy.prototype._removeSession = function _removeSession( session )
    {
        var index = this._sessions.indexOf( session );
        if ( index !== -1 ) this._sessions.splice( index, 1 );
    };
 
    MediaKeysProxy.prototype.createSession = function createSession( sessionType )
    {
        if ( !sessionType || sessionType === 'temporary' ) return this._mediaKeys.createSession();
 
        var session = new MediaKeySessionProxy( this, sessionType );
        this._sessions.push( session );
 
        if ( this._videoElement ) session._listen( this._videoElement );
 
        return session;
    };
 
    MediaKeysProxy.prototype.setServerCertificate = function setServerCertificate( certificate )
    {
        return this._mediaKeys.setServerCertificate( certificate );
    };
 
    function MediaKeySessionProxy( mediaKeysProxy, sessionType )
    {
        EventTarget.call( this );
 
        this._mediaKeysProxy = mediaKeysProxy
        this._sessionType = sessionType;
        this._sessionId = "";

        this._loading = false;
        this._removing = false;
        this._wasclosed = false;
        this._sessionclosed = false;
 
        this._closed = new Promise( function( resolve ) { this._resolveClosed = resolve; }.bind( this ) );
    }
 
    MediaKeySessionProxy.prototype = Object.create( EventTarget.prototype );
 
    Object.defineProperties( MediaKeySessionProxy.prototype, {
    
        sessionId:  { get: function() { return this._sessionId; } },
        expiration: { get: function() { return NaN; } },
        closed:     { get: function() { return this._closed; } },
        keyStatuses:{ get: function() { return this._session.keyStatuses; } },       // TODO this will fail if examined too early
        _kids:      { get: function() { return this._keys.map( function( key ) { return key.kid; } ); } },
    });
 
    MediaKeySessionProxy.prototype._createSession = function _createSession()
    {
        this._session = this._mediaKeysProxy._mediaKeys.createSession();
 
        this._session.addEventListener( 'message', this._onMessage.bind( this ) );
        this._session.addEventListener( 'keystatuseschange', this._onKeyStatusesChange.bind( this ) );
 
        this._listen( this._videoElement );
    };
 
    MediaKeySessionProxy.prototype._onMessage = function _onMessage( event )
    {
        if ( this._loading )
        {
            this._session.update( toUtf8( { keys: this._keys } ) )
            .then( this._loaded );
 
            this._loading = false;
        }
        else
        {
            this.dispatchEvent( event );
        }
    };
 
    MediaKeySessionProxy.prototype._onKeyStatusesChange = function _onKeyStatusesChange( event )
    {
        this.dispatchEvent( event );
    };
 
    MediaKeySessionProxy.prototype._onTimeUpdate = function _onTimeUpdate( event )
    {
        if ( !this._tfirst ) this._tfirst = Date.now();
        this._tlatest = Date.now();
    };
 
    MediaKeySessionProxy.prototype._queueMessage = function _queueMessage( messageType, message )
    {
        setTimeout( function() {
        
            var messageAsArray = toUtf8( message ).buffer;
        
            this.dispatchEvent( new MediaKeyMessageEvent( 'message', { messageType: messageType, message: messageAsArray } ) );
        
        }.bind( this ) );
    };
 
    MediaKeySessionProxy.prototype._listen = function _listen( videoElement )
    {
        if ( this._sessionType !== 'persistent-usage-record' ) return;

        this._unlisten();
        this._videoElement = videoElement;
 
        if ( this._session && this._videoElement )
        {
            this._onTimeUpdateListener = this._onTimeUpdate.bind( this );
            this._videoElement.addEventListener( 'timeupdate', this._onTimeUpdateListener );
        }

    };
 
    MediaKeySessionProxy.prototype._unlisten = function _unlisten()
    {
        if ( this._sessionType !== 'persistent-usage-record' ) return;
 
        if ( this._videoElement && this._onTimeUpdateListener )
        {
            this._videoElement.removeEventListener( 'timeupdate', this._onTimeUpdateListener );
            delete this._onTimeUpdateListener;
        }
    };
 
    function _storageKey( sessionId )
    {
        return '__clearkey__' + sessionId;
    }
 
    MediaKeySessionProxy.prototype._store = function _store()
    {
        var data;
 
        if ( this._sessionType === 'persistent-usage-record' )
        {
            data = { kids: this._kids };
            if ( this._tfirst ) data.tfirst = this._tfirst;
            if ( this._tlatest ) data.tlatest = this._tlatest;
        }
        else
        {
            data = { keys: this._keys };
        }
 
        window.localStorage.setItem( _storageKey( this._sessionId ), JSON.stringify( data ) );
    };
 
    MediaKeySessionProxy.prototype._load = function _load( sessionId )
    {
        var data = JSON.parse( window.localStorage.getItem( _storageKey( sessionId ) ) );
 
        if ( data.kids )
        {
            this._sessionType = 'persistent-usage-record';
            this._keys = data.kids.map( function( kid ) { return { kid: kid }; } );
            if ( data.tfirst ) this._tfirst = data.tfirst;
            if ( data.tlatest ) this._tlatest = data.tlatest;
        }
        else
        {
            this._keys = data.keys;
        }
    };
 
    MediaKeySessionProxy.prototype._clear = function _clear()
    {
        window.localStorage.removeItem( _storageKey( this._sessionId ) );
    };
 
    MediaKeySessionProxy.prototype.generateRequest = function generateRequest( initDataType, initData )
    {
        if ( this._session ) return Promise.reject( new InvalidStateError() );
 
        this._createSession();
 
        return this._session.generateRequest( initDataType, initData )
        .then( function() {
            this._sessionId = Math.random().toString(36).slice(2);
        });
    };
 
    MediaKeySessionProxy.prototype.load = function load( sessionId )
    {
        return new Promise( function( resolve, reject ) {
        
            try
            {
                this._load( sessionId );
                
                if ( this._sessionType === 'persistent-usage-record' )
                {
                    var msg = { kids: this._kids };
                    if ( this._tfirst ) msg.tfirst = this._tfirst;
                    if ( this._tlatest ) msg.tlatest = this._tlatest;
                    
                    this._queueMessage( 'license-release', msg );
                    
                    resolve();
                }
                else
                {
                    this._createSession();
                    
                    this._loading = true;
                    this._loaded = resolve;
                    
                    var initData = { kids: this._kids };
                    
                    this._session.generateRequest( 'keyids', toUtf8( initData ) );
                }
                
            }
            catch( error )
            {
                reject( error );
            }
            
        }.bind( this ) );
    };
 
    MediaKeySessionProxy.prototype.update = function update( response )
    {
        if ( this._wasclosed ) return Promise.reject( new InvalidStateError() );
 
        return new Promise( function( resolve, reject ) {
            try
            {
                var message = fromUtf8( response );
                if ( !this._removing && message.keys )
                {
                    // JSON Web Key Set
                    this._keys = message.keys;
                    
                    this._store();
                    
                    resolve( this._session.update( response ) );
                }
                else if ( this._removing && message.kids )
                {
                    this._clear();
                    
                    this._removing = false;
                    this._wasclosed = true;
                    
                    this._mediaKeysProxy._removeSession( this );
                    
                    this._resolveClosed();
                    
                    delete this._session;
                    
                    resolve();
                }
                else
                {
                    reject( new TypeError() );
                }
            }
            catch( error )
            {
                reject( error );
            }
        }.bind( this ) );
    };
 
    MediaKeySessionProxy.prototype.close = function close()
    {
        if ( this._wasclosed ) return Promise.resolved();
 
        window.console.log( 'proxy session closed' );
 
        this._wasclosed = true;
 
        this._unlisten();
 
        this._mediaKeysProxy._removeSession( this );
 
        this._resolveClosed();
 
        var session = this._session;
        if ( !session ) return Promise.resolve();
 
        this._session = undefined;
 
        return session.close();
    };
 
    MediaKeySessionProxy.prototype.remove = function remove()
    {
        if ( !this._session ) return Promise.reject( new InvalidStateError() );
 
        this._unlisten();
 
        this._mediaKeysProxy._removeSession( this );
 
        this._removing = true;
 
        return this._session.close()
        .then( function() {
        
            var msg = { kids: this._kids };
            
            if ( this._sessionType === 'persistent-usage-record' )
            {
                if ( this._tfirst ) msg.tfirst = this._tfirst;
                if ( this._tlatest ) msg.tlatest = this._tlatest;
            }
            
            this._queueMessage( 'license-release', msg );
        
        }.bind( this ) )
    };
 
    HTMLMediaElement.prototype.setMediaKeys = function setMediaKeys( mediaKeys )
    {
        if ( mediaKeys instanceof MediaKeysProxy )
        {
            mediaKeys._setVideoElement( this );
            return _setMediaKeys.call( this, mediaKeys._mediaKeys );
        }
        else
        {
            return _setMediaKeys.call( this, mediaKeys );
        }
    };
 
    navigator.requestMediaKeySystemAccess = function( keysystem, configurations )
    {
        // First, see if this is supported by the platform
        return new Promise( function( resolve, reject ) {
        
            _requestMediaKeySystemAccess( keysystem, configurations )
            .then( function( access ) { resolve( access ); } )
            .catch( function( error ) {
            
                if ( error instanceof TypeError ) reject( error );
     
                if ( keysystem !== 'org.w3.clearkey' ) reject( error );
     
                if ( !configurations.some( is_persistent_configuration ) ) reject( error );
     
                // Shallow copy the configurations, swapping out the labels and omitting the sessiontypes
                var configurations_copy = configurations.map( function( config, index ) {
                
                    var config_copy = copy_configuration( config );
                    config_copy.label = index.toString();
                    return config_copy;
                
                } );
     
                // And try again with these configurations
                _requestMediaKeySystemAccess( keysystem, configurations_copy )
                .then( function( access ) {
     
                    // Create the supported configuration based on the original request
                    var configuration = access.getConfiguration(),
                        original_configuration = configurations[ configuration.label ];
         
                    // If the original configuration did not need persistent session types, then we're done
                    if ( !is_persistent_configuration( original_configuration ) ) resolve( access );
         
                    // Create the configuration that we will return
                    var returned_configuration = copy_configuration( configuration );
         
                    if ( original_configuration.label )
                        returned_configuration.label = original_configuration;
                    else
                        delete returned_configuration.label;
         
                    returned_configuration.sessionTypes = original_configuration.sessionTypes;
         
                    resolve( new MediaKeySystemAccessProxy( keysystem, access, returned_configuration ) );
                } )
                .catch( function( error ) { reject( error ); } );
            } );
        } );
    };
 
    function is_persistent_configuration( configuration )
    {
        return configuration.sessionTypes &&
                ( configuration.sessionTypes.indexOf( 'persistent-usage-record' ) !== -1
                || configuration.sessionTypes.indexOf( 'persistent-license' ) !== -1 );
    }
 
    function copy_configuration( src )
    {
        var dst = {};
        [ 'label', 'initDataTypes', 'audioCapabilities', 'videoCapabilities', 'distinctiveIdenfifier', 'persistentState' ]
        .forEach( function( item ) { if ( src[item] ) dst[item] = src[item]; } );
        return dst;
    }
}());