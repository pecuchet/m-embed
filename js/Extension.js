define(['MediumEditor','Request','View'], function (Medium, EmbedRequest, EmbedView)
{
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
});