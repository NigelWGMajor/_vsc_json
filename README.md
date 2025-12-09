# Json Visualizer

(This is a port of my JsonToHtml C# class).

## Overview

Allows compact visualization of nested Json data structures. 

It can be opened from the toolbar when a Json document is in the editor, or can be launched with `to-json-visual-from-clip` to show data from the clipboard. 

The clipboard visualizer also supports common representations of tabular data (csv, tsv) to support common database dumps: if the data is truly rectangular/tabular, a toolbar option offers to toggle a wide view with all the data, otherwise only one element of nested collections is shown at a time:

- clicking on any property in a collection steps;
- clicking the label at the head of the collection resets.

The saved HTML version includes javascript to drive the collctiopn stepping, so this can be used as a passive data snapshot.

Other options include 

- opening in the browser
- sorting the active JSON file alphabetically from the editor toolbar or command palette
- saving as Json
- toggle light/dark mode
- toggle Pascall/Camel casing
- case toggle for Pascall vs Camel case.

Specific to C# files, selecting a variable or expression and using `to-debug-dump-cs` will attempt to serialize the variable or expression to json and open a new window with that data. 
Typescript and Javascript should work with `to-debug-dump-js`.
(If it is unable to capture, right-click the last output in the debug console and clopy to the clipboard, then use the `to-json-visual-from-clip` command)

## Development

```bash
npm install
```

```bash
npm run compile
```

```bash
npm run package
```
## Testing

Press F5 in VSCode to open a new Extension Development Host window.

## License

MIT

## Acknowledgments

Claude Sonnet 4.5 was used during this development.
