/*! m-embed 1.0.4 by dotburo (http://www.dotburo.org) license: GPL-3.0+ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['MediumEditor'], factory);
    } else if (typeof module === 'object') {
        module.exports = factory(require('medium-editor'));
    } else {
        root.MEmbed = factory(root.MediumEditor);
}
}(this, function (Medium) {
'use strict';
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
    

    var _viewId = 0,
        _eventId = 0,
        _dropTrap = null,

        /**
         * Create the preview for a request.
         * @param extension
         * @param editor
         * @param editorIndex
         * @constructor
         */
        EmbedView = function (extension, editor, editorIndex)
        {
            this.doc = extension.document;
            this.isClean = true;
            this.id = _viewId++;

            this.editorIndex = editorIndex;
            this.options = extension.options;
            this.extension = extension;
            this.editor = editor;

            this.els = {};
            this.events = {};

            this.addCustomEvent('m-embed', 'progress', this.showProgress, this);
            this.addCustomEvent('m-embed', 'success', this.initPreview, this);
            this.addCustomEvent('m-embed', 'swap', this.swapVisual, this);

            if (this.options.displayErrors) {
                this.addCustomEvent('m-embed', 'error', this.showError, this);
            }
        };

    EmbedView.prototype = {

        /**
         * Keep track of bound script events, so we can remove them later when needed.
         * @param type
         * @param name
         * @param handler
         * @param ctx
         */
        addCustomEvent : function (type, name, handler, ctx)
        {
            handler = handler.bind(ctx);
            this.extension.subscribe(type + ':' + name, handler);
            this.events[name] = function() { ctx.extension.base.unsubscribe(type + ':' + name, handler); };
        },

        /**
         * Keep track of bound DOM events, so we can remove them later when needed.
         * @param target
         * @param type
         * @param name
         * @param handler
         */
        addEvent : function (target, type, name, handler)
        {
            var self = this;
            if (typeof name === 'function') {
                handler = name;
                name = ++_eventId;
            }
            this.extension.on(target, type, handler);
            this.events[name] = function() { self.extension.off(target, type, handler); };
        },

        /**
         * Test if a triggered custom event is meant for this view.
         * @param data : event data object
         * @param editor : editor element passed in event
         * @returns {boolean}
         */
        isViewOfEvent : function (data, editor)
        {
            return data.viewId === this.id && editor.getAttribute('medium-editor-index') == this.editorIndex;
        },

        /**
         * Show request progress.
         * @param data
         * @param editor
         */
        showProgress : function (data, editor)
        {
            if (this.isViewOfEvent(data, editor)) {
                if (!this.els.progress) {
                    this.makeProgressBar();
                }
                this.els.progress.style.width = data.msg + '%';
            }
        },

        /**
         * Display errors.
         * @param data
         * @param editor
         */
        showError : function (data, editor)
        {
            if (this.isViewOfEvent(data, editor)) {
                this.els.preview.innerHTML = "<p>" + data.msg + "</p>";
                this.els.preview.classList.remove('loading');
                this.els.preview.classList.add('error');
            }
        },

        /**
         * We want to allow replacing the media on drag 'n drop,
         * since iFrames don't emit their parent doc drag event,
         * we need to set up a transparent trap before them.
         */
        handleDrag : function (e)
        {
            if (this.els.mediaHtml) {
                if (e.type === 'dragover' && !_dropTrap) {
                    _dropTrap = this.doc.createElement('div');
                    _dropTrap.className = 'm-embed-dropTrap';
                    this.els.visuals.insertBefore(_dropTrap, this.els.mediaHtml);
                }
                if (e.type === 'dragleave' && _dropTrap) {
                    _dropTrap.parentNode.removeChild(_dropTrap);
                    _dropTrap = null;
                }
            }
        },

        /**
         * Create and append the two outer elements for the preview.
         * Before displaying the actual embed, it can contain the progress
         * notification, as well as errors if needed.
         */
        makeArea : function ()
        {
            var d = this.doc,
                preview = d.createElement('section'),
                link = d.createElement('a');

            preview.className = 'm-embed';
            preview.setAttribute('data-m-embed-id', this.id);
            preview.appendChild(link);

            link.target = this.options.linkTarget;

            this.setPreviewAttributes(preview);
            this.setLinkAttributes(link);

            this.editor.appendChild(preview);
        },

        setPreviewAttributes : function (preview)
        {
            preview.setAttribute('contenteditable', 'false');
            this.els.preview = preview;
        },

        setLinkAttributes : function (link)
        {
            link.setAttribute('data-disable-preview', 'true');
            this.addEvent(link, 'click', function(e){ e.preventDefault(); });
            this.els.previewLink = link;
        },

        /**
         * Create the progress notification element.
         */
        makeProgressBar : function ()
        {
            var d = this.doc,
                el = d.createElement('div'),
                p = d.createElement('p'),
                barOuter = d.createElement('div'),
                barInner = d.createElement('div');

            p.textContent = 'Fetching preview...';
            barOuter.className = 'm-embed-progress';

            el.appendChild(p);
            el.appendChild(barOuter);
            barOuter.appendChild(barInner);

            this.els.progress = barInner;

            this.els.preview.classList.add('loading');
            this.els.previewLink.innerHTML = '';
            this.els.previewLink.appendChild(el);
        },

        /**
         * Insert the actual preview, in the created area.
         */
        initPreview : function (data, editor)
        {
            var preview;

            if (!this.isViewOfEvent(data, editor)) { return; }

            // Check if got a minimal data set.
            if (!data || !(data.title && data.description)) {
                this.showError('This url has not enough metadata to create a preview.');
                return;
            }

            // Hide the medium toolbar
            if (this.extension.options.hideToolbarAfter) {
                this.extension.hideForm();
                this.extension.base.getExtensionByName('toolbar').hideToolbar();
            }
            // Deselect selection
            if (this.extension.options.deselectAfter) {
                this.deselect();
            }

            // Sort the images widest first.
            data.images = data.images ? this.sortImages(data.images) : [];

            // Add the media to the images array.
            // The user will be able to cycle through it.
            if (data.media && data.media.html) {
                data.images.unshift(data.media);
                // Don't loose drag event over iframes
                this.addEvent(this.els.preview, 'dragover', 'trap', this.handleDrag.bind(this));
            }

            // Store for later.
            this.data = data;

            // Create a nav element with a trash button.
            this.makeNav();

            // Setup the HTML
            preview = this.makeTxtContent();

            // If we have media, include a next/prev buttons
            // and render the first media in row.
            if (data.images.length) {
                this.makeMediaNav();
                preview = this.makeVisuals(preview);
            }

            this.els.preview.classList.remove('loading');
            this.els.previewLink.innerHTML = '';
            this.els.previewLink.appendChild(preview);

            this.isClean = false;
        },

        /**
         * Create the elements for holding the text.
         * @returns {DocumentFragment}
         */
        makeTxtContent : function ()
        {
            var d = this.doc,
                content = this.data,
                frag = d.createDocumentFragment(),
                text = d.createElement('div'),
                title = d.createElement('h4'),
                desc = d.createElement('p'),
                footer = d.createElement('footer');

            text.className = 'm-embed-text m-insert-no-drop';
            text.setAttribute('contenteditable', 'true');
            title.textContent = content.title;
            desc.textContent = content.description;
            footer.textContent = content.provider_display;

            text.appendChild(title);
            text.appendChild(desc);
            text.appendChild(footer);
            frag.appendChild(text);

            this.els.previewLink.href = content.url;

            return frag;
        },

        /**
         * Create a navigation bar with a trash button.
         */
        makeNav : function ()
        {
            var d = this.doc,
                nav = d.createElement('nav') ,
                trash = d.createElement('button');

            // Preview trash button
            nav.className = 'm-insert-no-drop';
            trash.className = 'm-embed-btn m-embed-btn-trash';
            trash.title = 'Delete preview';
            trash.setAttribute('aria-label', 'Delete preview');
            trash.innerHTML = this.extension.getEditorOption('buttonLabels') === 'fontawesome' ? '<i class="fa fa-trash-o"></i>' : this.extension.formCloseLabel;

            // Trash event
            this.addEvent(trash, 'click', 'trash', this.destroy.bind(this));

            this.els.nav = nav;

            // Insert in DOM.
            nav.appendChild(trash);
            this.els.preview.insertBefore(nav, this.els.previewLink);
        },

        /**
         * A button to remove the embedded media.
         */
        makeMediaNav : function ()
        {
            var d = this.doc,
                nav = d.createElement('div'),
                trash = d.createElement('button');

            trash.className = 'm-embed-btn m-embed-btn-trash';
            trash.title = 'Delete preview media';
            trash.setAttribute('aria-label', 'Delete preview media');
            trash.innerHTML = this.extension.getEditorOption('buttonLabels') === 'fontawesome' ? '<i class="fa fa-times"></i>' : this.extension.formCloseLabel;

            this.addEvent(trash, 'click', 'media:trash', this.removeMedia.bind(this));

            this.els.mediaNav = nav;

            this.els.mediaNav.appendChild(trash);
            this.els.nav.appendChild(this.els.mediaNav);
        },

        /**
         * Creates the HTML for the media (images, videos,..) content.
         */
        makeVisuals : function (frag)
        {
            var d = this.doc,
                content = this.data,
                visual = d.createElement('div'),
                html, img;

            this.els.visuals = visual;
            this.mediaIndex = 0;
            this.mediaTotal = content.images.length;

            visual.className = 'm-embed-visual m-insert-swap';

            // If the first item in the array has and html property,
            // it is a media which was un-shifted in the array.
            if (content.images[0].html) {
                html = d.createElement('div');
                html.innerHTML = content.media.html;
                html.className = 'm-embed-html';
                this.els.mediaHtml = html;
            }

            if ((html && this.mediaTotal > 1) || (!html && this.mediaTotal > 0)) {
                img = d.createElement('div');
                img.className = 'm-embed-image';
                this.els.img = img;

                // Set the first image.
                this.changeMedia(true);
            }

            // Next/prev nav.
            if (content.images.length > 1) {
                this.makeVisualNav();
            }

            // Append what was created.
            if (html) {
                visual.appendChild(html);
            }
            if (img) {
                visual.appendChild(img);
            }

            frag.insertBefore(visual, frag.firstChild);

            return frag;
        },

        /**
         * Custom event handler for m-embed:swap,
         * replace the media content with a single image.
         * @param file
         */
        swapVisual : function (file)
        {
            var mime = file.mime.split('/').pop();

            if (/(jp(e)g|gif|svg|png)/.test(mime)) {
                this.els.visuals.innerHTML = '';
                if (!this.els.img) {
                    this.els.img = this.doc.createElement('div');
                    this.els.img.className = 'm-embed-image';
                }
                this.els.img.style.backgroundImage = "url(" + file.url + ")";
                this.els.visuals.appendChild(this.els.img);
                // We are replacing the media, with one image,
                // we therefore don't need the nav UI anymore.
                if (this.els.mediaPrev) {
                    this.events['media:prev']();
                    this.events['media:next']();
                    this.els.mediaNav.removeChild(this.els.mediaPrev);
                    this.els.mediaNav.removeChild(this.els.mediaNext);
                }
                this.els.mediaHtml = null;
                // Emit the chosen media data.
                this.extension.trigger('m-embed:media', file, this.editor);
            }
        },

        /**
         * Create the previous/next buttons to cycle
         * between the multiple media.
         */
        makeVisualNav : function ()
        {
            var d = this.doc,
                prev = d.createElement('button'),
                next = d.createElement('button');

            prev.className = next.className = 'm-embed-btn m-embed-btn-';
            prev.className += 'prev';
            next.className += 'next';
            prev.title = 'Previous media';
            prev.setAttribute('aria-label', 'Previous media');
            next.title = 'Next media';
            next.setAttribute('aria-label', 'Next media');

            prev.innerHTML = this.extension.getEditorOption('buttonLabels') === 'fontawesome' ? '<i class="fa fa-chevron-left"></i>' : this.extension.formLeftLabel;
            next.innerHTML = this.extension.getEditorOption('buttonLabels') === 'fontawesome' ? '<i class="fa fa-chevron-right"></i>' : this.extension.formRightLabel;

            this.addEvent(prev, 'click', 'media:prev', this.prevMedia.bind(this));
            this.addEvent(next, 'click', 'media:next', this.nextMedia.bind(this));

            this.els.mediaPrev = prev;
            this.els.mediaNext = next;

            this.els.mediaNav.insertBefore(next, this.els.mediaNav.firstChild);
            this.els.mediaNav.insertBefore(prev, next);
        },

        /**
         * Event handler for previous visual button.
         */
        prevMedia : function (e)
        {
            e.preventDefault();

            this.mediaIndex--;

            if (this.mediaIndex < 0) {
                this.mediaIndex = this.mediaTotal -1;
            }
            this.changeMedia();
        },

        /**
         * Event handler for next visual button.
         */
        nextMedia : function (e)
        {
            e.preventDefault();

            this.mediaIndex++;

            if (this.mediaIndex > this.mediaTotal -1) {
                this.mediaIndex = 0;
            }
            this.changeMedia();
        },

        /**
         * Select a previous/next media according to
         * the current index.
         */
        changeMedia : function ()
        {
            var media = this.data.images[this.mediaIndex],
                els = this.els;

            if (media.html) {
                // Show iFrame html.
                els.visuals.classList.add('show-html');
                els.preview.classList.remove('thumbnail');
            } else {
                // Set image source
                els.img.style.backgroundImage = "url(" + media.url + ")";
                // Set image size/preview type.
                this.setImageSize(media);
                // Hide iFrame, if any.
                if (els.mediaHtml) {
                    els.visuals.classList.remove('show-html');
                }
            }

            // Emit the chosen media data.
            this.extension.trigger('m-embed:media', media, this.editor);
        },

        /**
         * Add classes according to the current image width.
         * Adds 'thumbnail' to the preview element, if lower than 'thumbnailSize',
         * and 'mini' to the image div, if lower or equal to 'thumbnailMini'.
         * @param media
         */
        setImageSize : function (media)
        {
            if (media.width < this.options.thumbnailSize) {
                this.els.preview.classList.add('thumbnail');
                if (media.width <= this.options.thumbnailMini) {
                    this.els.img.classList.add('mini');
                } else {
                    this.els.img.classList.remove('mini');
                }
            } else {
                this.els.preview.classList.remove('thumbnail');
                this.els.img.classList.remove('mini');
            }
        },

        /**
         * Remove all media content and UI.
         */
        removeMedia : function (e)
        {
            var visuals = this.els.visuals || this.els.nav.parentNode.querySelector('.m-embed-visual');

            if (e) { e.preventDefault(); }

            // Content.
            if (visuals) {
                this.els.previewLink.removeChild(visuals);
            }
            // UI
            if (this.els.mediaNav) {
                this.els.nav.removeChild(this.els.mediaNav);
            }
            // Nullify.
            this.els.visuals = this.els.mediaNav = this.els.mediaHtml = this.els.img = null;
            // Remove events.
            this.events['media:trash']();
            if (this.events['media:prev']) {
                this.events['media:prev']();
                this.events['media:next']();
            }
            // Emit.
            this.extension.trigger('m-embed:no-media', null, this.editor);
        },

        /**
         * Remove classNames, UI, contentEditable attribute
         * Called by custom event m-embed:cleanup.
         */
        cleanup : function ()
        {
            var self = this, els, i, l;

            // remove events
            Object.keys(this.events).forEach(function(name){
                self.events[name]();
            });

            // remove ui
            if (this.els.nav) {
                this.els.preview.removeChild(this.els.nav);
            }

            // remove attributes
            this.els.preview.removeAttribute('contenteditable');
            this.els.previewLink.removeAttribute('data-disable-preview');
            this.els.preview.querySelector('.m-embed-text').removeAttribute('contenteditable');

            // remove helper classes
            els = this.els.previewLink.querySelectorAll('.m-insert-swap, .m-insert-no-drop');
            for (i = 0, l = els.length; i < l; i++) {
                els[i].classList.remove('m-insert-swap');
                els[i].classList.remove('m-insert-no-drop');
            }

            // remove non-chosen media
            if (this.els.visuals) {
                if (this.els.visuals.classList.contains('show-html') ) {
                    if (this.els.img) {
                        this.els.visuals.removeChild(this.els.img);
                        this.els.img = null;
                    }
                    //this.els.visuals.classList.remove('show-html');
                } else if (this.els.mediaHtml) {
                    this.els.visuals.removeChild(this.els.mediaHtml);
                    this.els.mediaHtml = null;
                }
            }

            this.isClean = true;
        },

        /**
         * Re-apply classNames, trash button, contentEditable attribute.
         * Called by custom event m-embed:revive.
         */
        revive : function (previewEl)
        {
            var visual, media, text, data = {};

            if (this.isClean) {
                this.setPreviewAttributes(previewEl);
                this.setLinkAttributes(previewEl.getElementsByTagName('a')[0]);

                data.url = this.els.previewLink.href;

                this.makeNav();

                visual = this.els.preview.querySelector('.m-embed-visual');
                text = this.els.preview.querySelector('.m-embed-text');

                if (visual) {
                    this.els.visuals = visual;
                    visual.classList.add('m-insert-swap');
                    // visual.classList.add('show-html');
                    // A button to remove the embedded media.
                    this.makeMediaNav();

                    media = visual.getElementsByClassName('m-embed-html')[0];
                    if (media) {
                        data.media = {
                            html : media.innerHTML
                        };
                        this.els.mediaHtml = media;
                        // Don't loose drag event over iframes
                        this.addEvent(this.els.preview, 'dragover', 'trap', this.handleDrag.bind(this));
                    } else {
                        media = visual.getElementsByClassName('m-embed-image')[0];
                        if (media) {
                            data.images = [{
                                url: this.extension.window.getComputedStyle(media, null).backgroundImage
                            }];
                        }
                    }
                    // Emit the chosen media data.
                    this.extension.trigger('m-embed:media', media, this.editor);
                }

                if (text) {
                    text.classList.add('m-insert-no-drop');
                    text.setAttribute('contenteditable', 'true');
                }

                // Emit a 'successful request' message
                this.extension.trigger('m-embed:success', data, this.editor);

                this.isClean = false;
            }
        },

        /**
         * Remove the embed entirely.
         */
        destroy : function (e)
        {
            var self = this;

            if (e) { e.preventDefault(); }

            Object.keys(this.events).forEach(function(name){
                self.events[name]();
            });

            this.removePreview();

            this.els = this.events = null;
            this.extension.deleteView(this.id, this.editorIndex);
            // Emit.
            this.extension.trigger('m-embed:removed', null, this.editor);
        },

        removePreview : function ()
        {
            if (this.els.preview) {
                this.editor.removeChild(this.els.preview);
                this.els.preview = null;
            }
        },

        /**
         * Deselect selection.
         */
        deselect : function ()
        {
            var w = this.extension.window,
                d = w.document;

            if (w.getSelection) {
                if (w.getSelection().empty) {  // Chrome
                    w.getSelection().empty();
                } else if (w.getSelection().removeAllRanges) {  // Firefox
                    w.getSelection().removeAllRanges();
                }
            } else if (d.selection) {  // IE?
                d.selection.empty();
            }
        },

        /**
         * Sort the images according to their width, widest first.
         * @param images
         * @returns {*}
         */
        sortImages : function (images)
        {
            if (images.length < 2) {
                return images;
            }

            return images.sort(function (a,b) {
                return (a.width && b.width) ? b.width - a.width : 0;
            });
        }
    };

    

    /**
     * Triggered events:
     *      m-embed:error    > request validation, xhr & general errors  — { error object }
     *      m-embed:success  > successful request — { response }
     *      m-embed:progress > request progress — { msg: percentage }
     *      m-embed:media    > included media (picture, video), fired on render and on user choice — { media }
     *      m-embed:no-media > user has removed media from preview
     *      m-embed:removed  > preview has been removed
     *
     * Subscribed to events:
     *      m-embed:cleanup  > remove all non content clutter - pass in an editor element
     *      m-embed:revive   > reapply the ui for an existing preview - pass in an editor element
     *      m-embed:swap     > replace the media with an image - pass in { mime: '', url: '' } and an editor element
     */

    var _defaults = {
            // Request options
            key:              null,             // API key
            fakeData:         null,             // bypasses API key requirement
            endpoint:         'extract',        // @see http://embed.ly ('preview' & 'oembed' endpoints are available too)
            secure:           undefined,        // http(s)
            query:            {},               // @see http://embed.ly/docs/api/embed/arguments
            urlRe:            undefined,        // additional regex, just before the xhr call

            // View options
            allowMultiple:    false,           // Allow multiple embeds per editor
            linkTarget:       '_blank',
            displayErrors:    true,            // Display errors in the editor (they are emitted through an event too)
            hideToolbarAfter: true,            // Hide the toolbar after embedding
            deselectAfter:    true,            // Deselect the url after embedding
            thumbnailSize:    300,             // Images smaller than 300 will trigger a 'thumbnail' class on the main element.
            thumbnailMini:    100              // Size at which to add class 'mini' on the image div.
        },

        _invalidURL = false,

        MEmbed = Medium.extensions.form.extend(
        {
            name           : 'mEmbed',
            action         : 'mEmbed',
            aria           : 'Embed an url',
            contentDefault : '<b>&#60;&#47;&#62;</b>',
            contentFA      : '<i class="fa fa-picture-o"></i>',

            // default labels for the form buttons
            formLeftLabel: '&lt;',
            formRightLabel: '&gt;',

            init : function ()
            {
                Medium.extensions.form.prototype.init.apply(this);

                this.extend = Medium.util.extend;
                this.options = this.extend({}, _defaults, this.getEditorOption('mEmbed'));
                this.views = {};

                this.request = new EmbedRequest(this);

                this.subscribe('m-embed:cleanup', this.handleCleanup.bind(this));
                this.subscribe('m-embed:revive', this.handleRevive.bind(this));
            },

            handleClick : function (e)
            {
                e.preventDefault();
                e.stopPropagation();

                var range = Medium.selection.getSelectionRange(this.document);

                // Reset.
                _invalidURL = false;

                // Store the selection.
                this._selection  = range.toString();

               if (!this.isDisplayed()) {
                    this.showForm();
                }

                return false;
            },

            isDisplayed: function ()
            {
                return this.getForm().style.display === 'block';
            },

            showForm: function ()
            {
                var url = this.checkURL(this._selection);

                this.base.saveSelection();
                this.hideToolbarDefaultActions();

                // Show error if URL not valid.
                if (!url) {
                    this.getForm().classList.add('error');
                    _invalidURL = true;
                }

                // Insert the trimmed url or if it is not valid the original one.
                this.getInput().value = url || this._selection;

                this.getForm().style.display = 'block';

                this.setToolbarPosition();
            },

            getForm: function ()
            {
                if (!this.form) {
                    this.form = this.createForm();
                }
                return this.form;
            },

            hideForm: function () {
                var form = this.getForm();
                form.classList.remove('error');
                form.style.display = 'none';
                this.getInput().value = '';
            },

            doFormCancel: function () {
                this.base.restoreSelection();
                this.base.checkSelection();
            },

            createForm: function ()
            {
                var form = this.document.createElement('div');

                // Anchor Form (div)
                form.className = 'medium-editor-toolbar-form';
                form.id = 'medium-editor-toolbar-embed-' + this.getEditorId();
                form.innerHTML = this.getTemplate();
                this.attachFormEvents(form);

                return form;
            },

            getTemplate: function () {
                var template = [
                    '<input type="text" class="medium-editor-toolbar-input" value="">'
                ];

                template.push(
                    '<a href="#" class="medium-editor-toolbar-save">',
                    this.getEditorOption('buttonLabels') === 'fontawesome' ? '<i class="fa fa-check"></i>' : this.formSaveLabel,
                    '</a>'
                );

                template.push('<a href="#" class="medium-editor-toolbar-close">',
                    this.getEditorOption('buttonLabels') === 'fontawesome' ? '<i class="fa fa-times"></i>' : this.formCloseLabel,
                    '</a>');

                return template.join('');
            },

            getInput: function () {
                return this.getForm().querySelector('input.medium-editor-toolbar-input');
            },

            // form creation and event handling
            attachFormEvents: function (form)
            {
                var close = form.querySelector('.medium-editor-toolbar-close'),
                    save = form.querySelector('.medium-editor-toolbar-save'),
                    input = form.querySelector('.medium-editor-toolbar-input');

                // Handle typing in the text box
                this.on(input, 'keyup', this.onTextInput.bind(this));

                // Handle close button clicks
                this.on(close, 'click', this.onClose.bind(this));

                // Handle save button clicks (capture)
                this.on(save, 'click', this.onSubmit.bind(this), true);
            },

            /**
             * Validate the URL as the user modifies
             * it in the input field of the form.
             */
            onTextInput : function (e)
            {
                var url;

                // For ENTER -> create the preview
                if (e.keyCode === Medium.util.keyCode.ENTER) {
                    e.preventDefault();
                    this.onSubmit(e);
                    return;
                }

                // For ESCAPE -> close the form
                if (e.keyCode === Medium.util.keyCode.ESCAPE) {
                    e.preventDefault();
                    this.doFormCancel();
                    return;
                }

                url = this.checkURL(this.getInput().value);

                if (!url) {
                    _invalidURL = true;
                    this.getForm().classList.add('error');
                } else {
                    _invalidURL = false;
                    this.getForm().classList.remove('error');
                }
            },

            /**
             * Close the form
             * @param e
             */
            onClose : function (e)
            {
                e.preventDefault();
                e.stopPropagation();
                this.doFormCancel();
            },

            /**
             * Launch embedding
             * @param e
             */
            onSubmit : function (e)
            {
                var editor = this.base.getFocusedElement(),
                    editorIndex = parseInt(editor.getAttribute('medium-editor-index'), 10),
                    existingView, view;

                e.preventDefault();
                e.stopPropagation();

                var url = this.checkURL(this.getInput().value);

                if (_invalidURL) { return; }

                view = new EmbedView(this, editor, editorIndex);

                // Store the views per editor, according to their id,
                // since multiple views per editor can allowed.
                if (!this.views[editorIndex]) {
                    this.views[editorIndex] = {};
                } else if (!this.options.allowMultiple) {
                    // If multiple previews is not an option,
                    // destroy the existing preview for this editor.
                    existingView = Object.keys(this.views[editorIndex])[0];
                    if (existingView) {
                        this.views[editorIndex][existingView].destroy();
                    }
                }

                // Store the new preview.
                this.views[editorIndex][view.id] = view;

                // Already prepare preview area.
                view.makeArea();

                // Request the data to embed.
                this.request.init(url, {
                    viewId : view.id,
                    editor : editor
                });
            },

            /**
             * Cleanup UI, classNames etc. Use this before
             * storing the editor content (e.g. in a database).
             * @param editor
             */
            handleCleanup : function (editor)
            {
                var editorIndex, v;

                if (!editor) { return; }

                editorIndex = parseInt(editor.getAttribute('medium-editor-index'), 10);

                for (v in this.views[editorIndex]) {
                    if (this.views[editorIndex].hasOwnProperty(v)) {
                        this.views[editorIndex][v].cleanup();
                    }
                }
            },

            /**
             * Reapply UI after, for instance, the editor content,
             * was called from a database where is was stored after a cleanup.
             * @param editor
             */
            handleRevive : function (editor)
            {
                var editorIndex,
                    previews,
                    view;

                if (!editor) { return; }

                editorIndex = parseInt(editor.getAttribute('medium-editor-index'), 10);

                if (isNaN(editorIndex)) { return; }

                // If it doesn't exist, create an object to hold this editor's views.
                this.views[editorIndex] = this.views[editorIndex] ? this.views[editorIndex] : {};

                // Loop through all the views,
                // if are already instantiated, revive them, else,
                // instantiate and store them first.
                previews = editor.getElementsByClassName('m-embed');

                for (var i = 0, l = previews.length; i < l; i++) {
                    view = previews[i].getAttribute('data-m-embed-id');
                    if (this.views[editorIndex][view]) {
                        this.views[editorIndex][view].revive(previews[i]);
                    } else {
                        view = new EmbedView(this, editor, editorIndex);
                        this.views[editorIndex][view.id] = view;
                        view.revive(previews[i]);
                    }
                }
            },

            deleteView : function (viewId, editorIndex)
            {
                this.views[editorIndex][viewId] = null;
                delete this.views[editorIndex][viewId];
            },

            /**
             * Validate URL with the Request.js regex.
             * @param url
             * @returns {*}
             */
            checkURL : function (url)
            {
                url = url.trim();

                if (this.request.urlRe.test(url)) {
                    return url;
                }
                return null;
            }
        });

    return MEmbed;


}));