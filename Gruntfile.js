module.exports = function(grunt) {
    var pkg = require('./package.json'),
        fs = require('fs'),
        banner = '/*! '+pkg.name+' '+pkg.version+' by '+pkg.author+' license: '+pkg.license+' */\n',
        umd = '(function (root, factory) {\n'
                + "    if (typeof define === 'function' && define.amd) {\n"
                + "        define(['MediumEditor'], factory);\n"
                + "    } else if (typeof exports === 'object') {\n"
                + "        module.exports = factory(require('medium-editor'));\n"
                + "    } else {\n"
                + "        root.MEmbed = factory(root.MediumEditor);\n"
                + "}\n"
                + "}(this, function (Medium) {\n"
                + "'use strict';";

    grunt.initConfig({
        pkg: pkg,
        requirejs: {
            options: {
                baseUrl: "./js",
                include: ['Extension', 'Request', 'View'],
                wrap: {
                    start: banner + umd,
                    end: '\n}));'
                },
                paths: {
                    MediumEditor: "//cdn.jsdelivr.net/medium-editor/5.8.2/js/medium-editor.min"
                },
                onBuildWrite: function(name, path, contents)
                {
                    contents = contents.replace(/define\((.|\s)*?\{/, '');
                    contents = contents.replace(/}\s*\)\s*;*\s*?.*$/, '');
                    if ( name !== 'Extension' ) {
                        contents = contents.replace(/return.*[^return]*$/, '');
                    }
                    return contents;
                }
            },
            concat: {
                options: {
                    optimize: 'none',
                    out: function ( text ) {
                        fs.writeFileSync('./dist/js/medium-editor-m-embed.js', text);
                    }
                }
            },
            dist: {
                options: {
                    optimize: "uglify2",
                    out: function ( text ) {
                        fs.writeFileSync('./dist/js/medium-editor-m-embed.min.js', text);
                    }
                }
            }
        },
        jshint: {
            all: ['js/Extension.js', 'js/Request.js', 'js/View.js']
        }
    });

    grunt.loadNpmTasks('grunt-contrib-requirejs');
    grunt.loadNpmTasks('grunt-contrib-jshint');

    grunt.registerTask('concat', ['requirejs:concat']);
    grunt.registerTask('dist', ['requirejs:dist']);

    grunt.registerTask('default', ['requirejs:concat','requirejs:dist']);
};