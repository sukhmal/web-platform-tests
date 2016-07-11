// Test EME success path
//
// config = { element:        <container element for video element>,
//            keysystem:      <keysystem name>,
//            sessiontype:    <session type to test>,
//            attachsrcfirst: <attach src first>,
//            configuration:  <MediaKeySystemConfiguration>,
//            servercertificate: <The server certificate>,
//            messagehandler: <message handler function>,
//            audioType:      <audio content type>,
//            videoType:      <video content type>,
//            audioMedia:     <the audio media>,
//            videoMedia:     <the video media>,
//            duration:       <playback duration in seconds>,
//
// [optional fields]
//            initDataType:   <override data received in encrypted event>,
//            initData:       <override data received in encrypted event>
// };
//
// messagehandler function:
//    Promise<ArrayBuffer> messagehandler( messageType, message );
//

function eme_success( testname, config )
{
    var _video,
        _mediaKeys,
        _mediaKeySession,
        _mediaSource,
        _allKeysUsableEvent = false,
        _waitingForKeyEvent = false,
        _canPlayThroughEvent = false,
        _playingEvent = false,
        _timeupdateEvent = false,
        _releaseSequence = false,
        _events = [ ],
        _done,
        _failed;
    
    promise_test( function( test ) {
    
        window.console.log( testname + " running" );
    
        // Create our result, which will resolve when we are done.
        var result = new Promise( function( resolve, reject ) { _done = resolve; _failed = reject; } )
                        .then( function() { window.console.log( testname + " resolved" ); } )
                        .catch( function( reason ) {
                            window.console.log( testname + " failed" );
                            return Promise.reject( reason );
                        } );
        
        _mediaSource = testmediasource( test, config );
        
        var mediaKeysPromise = navigator.requestMediaKeySystemAccess(   config.keysystem,
                                                                        [ config.configuration ] )
        .then( function( access ) {
            return access.createMediaKeys();
        })
        .then( function( mediaKeys ) {
            
            _mediaKeys = mediaKeys;
            
            return config.servercertificate
                        ? _mediaKeys.setServerCertificate( config.servercertificate )
                        : true;
        })
        .then( test.step_func( function( result ) {
            
            assert_true( result, "SetServerCertificate returns true" );

            // Create the MediaKeySession
            _mediaKeySession = _mediaKeys.createSession( config.sessiontype );
    
            // Attach event handlers
            _mediaKeySession.addEventListener( 'message',           test.step_func( onMessage ) );
            _mediaKeySession.addEventListener( 'keystatuseschange', test.step_func( onKeyStatusesChange ) );
            _mediaKeySession.closed.then( test.step_func( onClosed ) );
            
            _video = document.createElement('video');
            _video.autoplay = true;
            _video.setAttribute( 'width', '600px' );
            config.element.appendChild( _video );

            _video.addEventListener( 'encrypted',      test.step_func( onEncrypted ) );
            _video.addEventListener( 'playing',        test.step_func( onPlaying ) );
            _video.addEventListener( 'timeupdate',     test.step_func( onTimeupdate ) );
            
            function onEncrypted( event )
            {
                //window.console.log( event );
                
                assert_equals(event.target, _video);
                assert_true(event instanceof window.MediaEncryptedEvent);
                assert_equals(event.type, 'encrypted');
              
                _mediaKeySession.generateRequest(   config.initDataType || event.initDataType,
                                                    config.initData || event.initData )
                .then( function() { _events.push( 'generaterequest' ); } );
            }
            
            function onMessage( event )
            {
                //window.console.log( event );
                
                assert_equals( event.target, _mediaKeySession );
                assert_true( event instanceof window.MediaKeyMessageEvent );
                assert_equals( event.type, 'message');
              
                assert_any( assert_equals,
                            event.messageType,
                            _releaseSequence    ? [ 'license-release']
                                                : [ 'license-request', 'individualization-request' ] );
                            
                if ( event.messageType !== 'individualization-request' )
                {
                    _events.push( event.messageType );
                }
                            
                config.messagehandler( event.messageType, event.message )
                .then( function( response ) {
                
                    if ( event.messageType === 'license-request' )
                    {
                        _events.push( 'license-response' );
                    }
                    else if ( event.messageType === 'license-release' )
                    {
                        _events.push( 'release-response' );
                    }
                    
                    _mediaKeySession.update( response )
                    .then( function() { _events.push('update'); } );
                    
                });
            }
    
            function onKeyStatusesChange( event )
            {
                assert_equals(event.target, _mediaKeySession );
                assert_true(event instanceof window.Event );
                assert_equals(event.type, 'keystatuseschange' );
                
                var hasKeys = false, pendingKeys = false;
                _mediaKeySession.keyStatuses.forEach( function( value, keyid ) {
                
                    assert_any( assert_equals, value, [ 'status-pending', 'usable' ] );
                                
                    hasKeys = true;
                    pendingKeys = pendingKeys || ( value === 'status-pending' );
                
                });
                
                if ( !_allKeysUsableEvent && hasKeys && !pendingKeys )
                {
                    _allKeysUsableEvent = true;
                    _events.push( 'allkeysusable' );
              
                    if ( config.attachsrcfirst ) setMediaKeys();
                }
                
                if ( !hasKeys )
                {
                    _events.push( 'emptykeyslist' );
                }
            }
    
            function onPlaying( event )
            {
                //window.console.log( event );
                
                _playingEvent = true;
                _events.push( 'playing' );
            }
    
            function onTimeupdate( event )
            {
                //window.console.log( event );
                
                if ( _video.currentTime > ( config.duration || 5 ) && !_timeupdateEvent ) {
                
                    _timeupdateEvent = true;

                    _video.pause();
                    
                    if ( config.sessiontype === 'temporary' )
                    {
                        _mediaKeySession.close()
                        .then( function() { _events.push( 'close' ); } );
                    }
                    else
                    {
                        _releaseSequence = true;
                        
                        _mediaKeySession.remove()
                        .then( function() { _events.push( 'remove' ); } );
                    }
                }
            }

            function onClosed()
            {
                window.console.log( testname + ' closed' );
                
                if ( config.sessiontype === 'temporary' )
                {
                    assert_array_equals( _events,
                                    [   'generaterequest',
                                        'license-request',
                                        'license-response',
                                        'update',
                                        'allkeysusable',
                                        'playing',
                                        'close'
                                    ],
                                    "Expected events sequence" );
                }
                else
                {
                    assert_array_equals( _events,
                                    [   'generaterequest',
                                        'license-request',
                                        'license-response',
                                        'update',
                                        'allkeysusable',
                                        'playing',
                                        'remove',
                                        'emptykeyslist',        // This is expected per spec, but not implemented on Chrome
                                        'license-release',
                                        'release-response',
                                    ],
                                    "Expected events sequence" );
                }
              
                _video.src = "";
                _video.setMediaKeys( null ).then( _done );
                
                config.element.removeChild( _video );
            }
    
        } ) )
        .then( config.attachsrcfirst ? attachSrc : setMediaKeys )           // if src first, setMediaKeys when key available
        .then( function() { if (!config.attachsrcfirst) attachSrc(); } )
        .catch( test.step_func( function ( error ) {
            _failed( error );
        } ) );
        
        function setMediaKeys()
        {
            return _video.setMediaKeys( _mediaKeys );
        }
        
        function attachSrc()
        {
            _video.src = URL.createObjectURL( _mediaSource );
        }
        
        // Return the promise which we'll resolve when we're done
        return result;
        
    }, testname );
};