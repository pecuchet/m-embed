define([], function ()
{
    var parametrise = function (data) {
            return Object.keys(data).map(function(k) {
                return encodeURIComponent(k) + '=' + encodeURIComponent(data[k]);
            }).join('&');
        },

        isValid = function (xhr) {
            return (xhr.status >= 200 && xhr.status < 300) || (xhr.status === 304);
        },

        xhr = function (url, originalURL) {
            var self = this,
                request = new XMLHttpRequest();

            // Emit early to display progress message.
            self.emit('progress', 0);

            request.open('GET', self.options.fakeData || url, true);

            request.onreadystatechange = function () {
                var response, error;

                if (request.readyState !== 4) { return; }

                response = JSON.parse(request.responseText);

                if (isValid(request)) {
                    response.originalURL = originalURL;
                    self.emit('success', response);
                } else  {
                    if (response.error_message) {
                        // Embedly
                        error = response.error_message + ' (' + response.error_code + ').';
                    } else if (request.statusText) {
                        error = request.statusText + ' (' + request.status + ').';
                    } else {
                        error = 'The request encountered and error, please try again later' + ' (' + request.status + ').';
                    }

                    self.emit('error', { msg: error, xhr: request });
                }
            };

            request.onprogress = function (e) {
                if (e.lengthComputable) {
                    self.emit('progress', (e.loaded / e.total) * 100);
                }
            };

            request.send();
        },

        EmbedRequest = function (extension)
        {
            this.extension = extension;
            this.options = extension.options;
        };

    EmbedRequest.prototype =
    {
        // Regex for url validation.
        urlRe : /(http|https):\/\/(\w+:?\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/,

        /**
         * Based on the method and options, build the url.
         * @param url
         * @returns {string}
         */
        buildURL : function(url)
        {
            var options = this.options,
                endpoint = options.endpoint,
                secure, base, query;

            // Protocol.
            secure = options.secure;

            if (!secure) {
                // If the secure param was not set, use current protocol instead.
                secure = this.extension.window.location.protocol === 'https:';
            }

            base = (secure ? 'https': 'http') +
                '://api.embed.ly/1/' + endpoint;

            // The query.
            query = options.query || {};
            query.key = options.key;
            query.url = url;
            base += '?' + parametrise(query);

            return base;
        },

        /**
         * Perform the request, override constructor options with passed options.
         * @param url
         * @param [options]
         */
        init : function(url, options)
        {
            var valid = true;

            // These will be passed with the triggered events,
            // so the views known for whom they are intended.
            this.viewId = options.viewId;
            this.editor = options.editor;

            // No url.
            if (!url){
                this.emit('error', 'There is no URL to embed.');
                return;
            }

            // Ad hoc options.
            options = this.extension.extend({}, this.options, options || {});

            // An app key is necessary.
            if (!options.key && !options.fakeData){
                this.emit('error', 'An API Key is required to fetch and embed.');
                return;
            }

            // If a regex has been passed, test the URL.
            if (options.urlRe && options.urlRe.test && !options.urlRe.test(url)) {
                valid = false;
            }

            // URL is not valid.
            if (!valid) {
                this.emit('error', 'The proposed URL is invalid.');
                return;
            }

            xhr.call(this, this.buildURL(url), url);
        },

        emit : function (type, data)
        {
            if (typeof data !== 'object') {
                data = {
                    msg : data
                };
            }

            data.viewId = this.viewId;
            this.extension.trigger('m-embed:' + type, data, this.editor);
        }
    };
    return EmbedRequest;
});