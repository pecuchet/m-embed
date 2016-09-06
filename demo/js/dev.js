;(function ( w ) {
    'use strict';

    var d = w.document;

    require.config({
        baseUrl: '/',
        urlArgs: "bust=" + (new Date()).getTime(),
        paths: {
            MediumEditor   :  "//cdn.jsdelivr.net/medium-editor/latest/js/medium-editor.min",
            Extension      :  "/m-embed/js/Extension",
            Request        :  "/m-embed/js/Request",
            View           :  "/m-embed/js/View"
        }
    });

    require([
        'MediumEditor',
        'Extension'
    ], function ( MediumEditor, MEmbed ) {
        var editors = d.getElementsByClassName('editable'),
            medium = new MediumEditor(
                editors,
                {
                    elementsContainer : d.getElementById('mediumElements'),
                    buttonLabels : 'fontawesome',
                    mEmbed : {
                        fakeData : '/m-embed/demo/data/demo.json'
                    },
                    toolbar: {
                        buttons: [
                            'bold',
                            'italic',
                            'underline',
                            'anchor',
                            'mEmbed'
                        ]
                    },
                    extensions: {
                        mEmbed: new MEmbed()
                    }
                });

        d.getElementById('cleanup').addEventListener('click', function(){
            medium.trigger('m-embed:cleanup', editors[0]);
            d.getElementById('cleanup').style.display = 'none';
            d.getElementById('revive').style.display = 'block';
        });
        d.getElementById('revive').addEventListener('click', function(){
            medium.trigger('m-embed:revive', editors[0]);
            d.getElementById('cleanup').style.display = 'block';
            d.getElementById('revive').style.display = 'none';
        });

        medium.subscribe('m-embed:error', function (data) {
            console.log('EVENT :::: m-embed error', data);
        });
        medium.subscribe('m-embed:success', function (data) {
            d.getElementById('cleanup').style.display = 'block';
            console.log('EVENT :::: fetch success', data);
        });
        medium.subscribe('m-embed:progress', function (data) {
            console.log('EVENT :::: fetch progress', data.msg);
        });
        medium.subscribe('m-embed:media', function (media) {
            d.getElementById('cleanup').style.display = 'block';
            console.log('EVENT :::: selected media', media);
        });
        medium.subscribe('m-embed:no-media', function () {
            console.log('EVENT :::: media removed');
        });
        medium.subscribe('m-embed:removed', function (view) {
            d.getElementById('cleanup').style.display = 'none';
            d.getElementById('revive').style.display = 'none';
            console.log('EVENT :::: preview removed',view);
        });
    });
})( window );
