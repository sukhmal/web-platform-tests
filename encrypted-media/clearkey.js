// Expect utf8decoder and utf8decoder to be TextEncoder('utf-8') and TextDecoder('utf-8') respectively

function ClearKey( keys )
{
    this._keys = keys;
}

ClearKey.prototype.messagehandler = function messagehandler( messageType, message )
{
    var self = this;
    
    if ( messageType === 'license-request' )
    {
        var request = fromUtf8( message );
        
        if ( request.type !== 'temporary' && request.type !== 'persistent-usage-record' )
        {
            throw new TypeError( 'Unsupported session type for ClearKey' );
        }
        
        var keys = request.kids.map( function( kid ) {
        
            return { kty: 'oct', kid: kid, k: self._keys[ kid ] };
        
        } );
        
        return Promise.resolve( toUtf8( { keys: keys } ) );
        
    }
    else if ( messageType === 'license-release' )
    {
        var release = fromUtf8( message );
        
        // TODO: Check the license release message here
        
        return Promise.resolve( toUtf8( { kids: release.kids } ) );
    }
    
    throw new TypeError( 'Unsupported message type for ClearKey' );
};