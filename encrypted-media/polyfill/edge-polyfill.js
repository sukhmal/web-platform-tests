(function() {

    if ( navigator.userAgent.toLowerCase().indexOf('edge') > -1) {

        var _requestMediaKeySystemAccess = navigator.requestMediaKeySystemAccess.bind( navigator ),
            _mediaKeySessionLoad = MediaKeySession.prototype.load,
            _mediaKeySessionUpdate = MediaKeySession.prototype.update,
            _mediaKeySessionRemove = MediaKeySession.prototype.remove,
            _setMediaKeys = HTMLMediaElement.prototype.setMediaKeys;

        MediaKeySession.prototype.load = function load( sessionId )
        {
            return _mediaKeySessionLoad.call( this, sessionId ).then( function() {

                if ( this._sessionType === 'persistent-usage-record' )
                {
                    return this.remove();
                }

            }.bind( this ) );
        };

        MediaKeySession.prototype.remove = function remove()
        {
            this._remove = true;
            return _mediaKeySessionRemove.call( this );
        };

        MediaKeySession.prototype.update = function update( message )
        {
            return _mediaKeySessionUpdate.call( this, message ).then( function() {

                if ( this._remove ) return this.close();

            }.bind( this ) );
        };

        function MediaKeys( mediaKeys )
        {
            this._mediaKeys = mediaKeys;
        }

        MediaKeys.prototype.setServerCertificate = function setServerCertificate( certificate )
        {
            return this._mediaKeys.setServerCertificate( certificate );
        };

        MediaKeys.prototype.createSession = function createSession( sessionType ) {

            var session = this._mediaKeys.createSession( sessionType );
            session._sessionType = sessionType;

            return session;
        };

        function MediaKeySystemAccess( access )
        {
            this._access = access;
        }

        Object.defineProperty( MediaKeySystemAccess.prototype, 'keySystem', { get: function() { return this._access.keySystem; } } );

        MediaKeySystemAccess.prototype.getConfiguration = function getConfiguration() { return this._access.getConfiguration(); };

        MediaKeySystemAccess.prototype.createMediaKeys = function createMediaKeys() {

            return this._access.createMediaKeys().then( function( mediaKeys ) { return new MediaKeys( mediaKeys ); } );

        };

        HTMLMediaElement.prototype.setMediaKeys = function setMediaKeys( mediaKeys )
        {
            if ( mediaKeys instanceof MediaKeys )
            {
                return _setMediaKeys.call( this, mediaKeys._mediaKeys );
            }
            else
            {
                return _setMediaKeys.call( this, mediaKeys );
            }
        };

        navigator.requestMediaKeySystemAccess = function requestMediaKeySystemAccess( keysystem, supportedConfigurations ) {

            if ( keysystem !== 'com.microsoft.playready' )
            {
                return _requestMediaKeySystemAccess( keysystem, supportedConfigurations );
            }

            return _requestMediaKeySystemAccess( keysystem, supportedConfigurations )
            .then( function( access ) { return new MediaKeySystemAccess( access ); } );
        };

    }
})();