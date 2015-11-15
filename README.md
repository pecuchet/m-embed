# M-Embed for MediumEditor
M-Embed is a [MediumEditor](https://github.com/daviferreira/medium-editor) extension to embed URL previews with [Embedly](http://embed.ly)'s API in your contenteditable editor. Once embedded, you can choose between the multiple media (images, iframes) returned for the URL. M-Embed has been written using vanilla JavaScript, no additional frameworks are required.

## Demo
[Here is a demo](http://pecuchet.github.io/m-embed) (using predefined data&mdash;without making a request to Embedly, which would require an API key. Embedly has free and paid plans to access their API.)

## Installation
**Via npm:**  
Run in your console: `npm install m-embed`

<br>
**Manual installation:**  
Download and reference MediumEditor and M-Embed along with their stylesheets. No other dependencies are necessary.
```
<script src="js/medium-editor.min.js"></script>
<script src="js/medium-editor-m-embed.min.js"></script>
<link rel="stylesheet" href="css/medium-editor.css"> <!-- MediumEditor -->
<link rel="stylesheet" href="css/medium-editor-m-embed.css"> <!-- M-Embed -->
<link rel="stylesheet" href="css/themes/default.css"> <!-- or any other theme -->
```


## Usage
Upon instantiation of the editor, instantiate the extension in the `extensions` property, reference the button in the `toolbar` > `buttons` array.

```
var editor = new MediumEditor('.editable', {
    mEmbed : {
        // options for m-embed 
    },
    toolbar: {
      buttons: [
          // other toolbar buttons
          'mEmbed'
      ]
    },
    extensions: {
        // other MediumEditor extensions
        mEmbed: new MEmbed()
    }
});
```

## Options
The following options, and their defaults, are available to customize M-Embed. The options object is passed as a property named `mEmbed` when you instantiate MediumEditor.

<br>
**Embedly options:**  

- **key** Your Embedly API key. Default: `null`
- **fakeData** For testing purposes, the API key requirement will be bypassed. Default: `null`
- **endpoint** API endpoint (see [Embedly](http://embed.ly/docs/api/embed/arguments)). Default: `'extract'`
- **secure** http(s) (see [Embedly](http://embed.ly/docs/api/embed/arguments)). Default: `undefined`
- **query** (see [Embedly](http://embed.ly/docs/api/embed/arguments)). Default: `{}`
- **urlRe** Additional regular expression to test the URL against, just before the XHR call. Default: `undefined`

<br>
**Preview options:**  

- **allowMultiple** Allow multiple embeds per editor. Default: `false`
- **displayErrors** Display errors in the editor (they are also emitted through an event). Default: `true`
- **linkTarget** The embed link target. Default: `'_blank'`
- **hideToolbarAfter** Hide the toolbar after embedding. Default: `true` 
- **deselectAfter** Deselect the url after embedding. Default: `true`
- **thumbnailSize** Images smaller than 300 will trigger a 'thumbnail' class on the main element. Default: `300`
- **thumbnailMini** Size at which to add class 'mini' on the image div. Default: `100`

## Events

**Triggered:**  

- **m-embed:error** Request validation, xhr & general errors — { msg, error }
- **m-embed:success** Successful request — { response }
- **m-embed:progress** Request progress — { msg: percentage }
- **m-embed:media** Included media (picture, video), fired on render and on user choice — { media }
- **m-embed:no-media** User has removed media from preview
- **m-embed:removed** Embed has been removed entirely

<br>
**Subscribed to:**

- **m-embed:cleanup** Remove all non content clutter &mdash; pass in the editor element
- **m-embed:revive** Reapply the ui for an existing preview &mdash; pass in the editor element
- **m-embed:swap** Replace the media with another image &mdash; pass in { mime: '', url: '' } and the editor element