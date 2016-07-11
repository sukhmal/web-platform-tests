function testmediasource( test, config )
{
    // Create media source
    var source = new MediaSource();
    
    // Create and fill source buffers when the media source is opened
    source.addEventListener( 'sourceopen', onSourceOpen );
    
    function onSourceOpen( event )
    {
        var audioSourceBuffer = source.addSourceBuffer( config.audioType ),
            videoSourceBuffer = source.addSourceBuffer( config.videoType );
        
        audioSourceBuffer.appendBuffer( config.audioMedia );
        videoSourceBuffer.appendBuffer( config.videoMedia );
        
        function endOfStream()
        {
            if ( audioSourceBuffer.updating || videoSourceBuffer.updating )
            {
                setTimeout( endOfStream, 250 );
            }
            else
            {
                source.endOfStream();
            }
        }
    
        endOfStream();
    }
    
    return source;
}
