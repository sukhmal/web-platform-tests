function messagehandler(messageType, message) {

    const keySystems = {
        'com.widevine.alpha': {
            responseType: 'json',
            getLicenseMessage: function(response) {
                return BASE64.decodeArray(response.license);
            },
            getErrorResponse: function(response) {
                return response;
            },
            getLicenseRequestFromMessage: function(message) {
                return new Uint8Array(message);
            },
            getRequestHeadersFromMessage: function(/*message*/) {
                return null;
            }
        },
        'com.microsoft.playready': {
            responseType: 'arraybuffer',
            getLicenseMessage: function(response) {
                return response;
            },
            getErrorResponse: function(response) {
                return String.fromCharCode.apply(null, new Uint8Array(response));
            },
            getLicenseRequestFromMessage: function(message) {
                // TODO: Add playready specific stuff.
                return message;
            },
            getRequestHeadersFromMessage: function(message) {
                // TODO: Add playready specific stuff.
                return null;
            }
        }
    };

    return new Promise(function(resolve, reject) {

        readTextFile("/encrypted-media/content/sources.json").then(function(response) {

            var xhr = new XMLHttpRequest(),
                keysystem = getKeySystem(),
                data = JSON.parse(response),
                protData = data[keysystem],
                url = undefined;

            if (protData) {
                if (protData.serverURL) {
                    url = protData.serverURL;
                } else {
                    reject('Undefined serverURL');
                    return;
                }
            } else {
                reject('Unsupported keySystem');
                return;
            }

            // Ensure valid license server URL
            if (!url) {
                reject('DRM: No license server URL specified!');
                return;
            }

            xhr.open("POST", url, true);
            xhr.responseType = keySystems[keysystem].responseType;
            xhr.onload = function() {
                if (this.status == 200) {
                    resolve(keySystems[keysystem].getLicenseMessage(this.response));
                } else {
                    reject('DRM: ' + keySystemString + ' update, XHR status is "' + this.statusText + '" (' + this.status + '), expected to be 200. readyState is ' + this.readyState + '.  Response is ' + ((this.response) ? keySystems[keysystem].getErrorResponse(this.response) : 'NONE'));
                    return;
                }
            };
            xhr.onabort = function() {
                reject('DRM: ' + keySystemString + ' update, XHR aborted. status is "' + this.statusText + '" (' + this.status + '), readyState is ' + this.readyState);
                return;
            };
            xhr.onerror = function() {
                reject('DRM: ' + keySystemString + ' update, XHR error. status is "' + this.statusText + '" (' + this.status + '), readyState is ' + this.readyState);
                return;
            };

            // Set optional XMLHttpRequest headers from protection data and message
            var updateHeaders = function(headers) {
                var key;
                if (headers) {
                    for (key in headers) {
                        if ('authorization' === key.toLowerCase()) {
                            xhr.withCredentials = true;
                        }
                        xhr.setRequestHeader(key, headers[key]);
                    }
                }
            };

            if (protData) {
                updateHeaders(protData.httpRequestHeaders);
            }

            updateHeaders(keySystems[keysystem].getRequestHeadersFromMessage(message));

            // Set withCredentials property from protData
            if (protData && protData.withCredentials) {
                xhr.withCredentials = true;
            }

            xhr.send(keySystems[keysystem].getLicenseRequestFromMessage(message));
        });
    });
}

function readTextFile(file) {
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.overrideMimeType("application/json");
        xhr.open("GET", file, true);

        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4 && xhr.status == "200") {
                resolve(xhr.responseText);
            }
        };

        xhr.send(null);
    });
}