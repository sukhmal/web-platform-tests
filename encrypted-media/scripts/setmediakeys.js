function runTest(config, qualifier) {
    var testname = testnamePrefix( qualifier, config.keysystem )
                                            + ', setMediaKeys';

    var configuration = getSimpleConfigurationForContent( config.content );

    if ( config.initDataType && config.initData ) {
        configuration.initDataTypes = [ config.initDataType ];
    }

    async_test (function (test) {
        var _video = config.video,
            _mediaKeys;

        // Test MediaKeys assignment.
        assert_equals(_video.mediaKeys, null);
        assert_equals(typeof _video.setMediaKeys, 'function');

        function onFailure(error) {
            forceTestFailureFromPromise(test, error);
        }

        // Try setting mediaKeys to null
        _video.setMediaKeys(null).then(function(result) {
            assert_equals(_video.mediaKeys, null);

            // Try setting mediakeys to the wrong type of object.
            return _video.setMediaKeys(new Date());
        }).then(function (result) {
            assert_unreached('setMediaKeys did not fail when setting to Date()');
        }, function(error) {
            // TypeError
            assert_equals(error.name, 'TypeError');
            return navigator.requestMediaKeySystemAccess(config.keysystem, [configuration]);
        }).then(function(access) {
            assert_equals(access.keySystem, config.keysystem)
            return access.createMediaKeys();
        }).then(function(result) {
            _mediaKeys = result;
            assert_not_equals(_mediaKeys, null);
            assert_equals(typeof _mediaKeys.createSession, 'function');
            return _video.setMediaKeys(_mediaKeys);
        }).then(function(result) {
            assert_not_equals(_video.mediaKeys, null);
            assert_true(_video.mediaKeys === _mediaKeys);
            test.done();
        }).catch(onFailure);
    }, testname);
}
