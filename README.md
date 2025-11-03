# Json Visualizer

(This is a port of my JsonToHtml C# class).

## Overview

It allows compact visualization of nested Json data structures. 

It can be opened from the toolbar when a Json document is in the editor, or can be launched with `to-json-visual-from-clip` to show data from the clipboard. 

The clipboard visualizer also supports common representations of tabular data (csv, tsv) to support common database dumps: if the data is truly rectangular/tabular, there is a toolbar option to show a wide view with all the data, otherwise only one element of nested collections is shown at a time, but clicking on any property steps to the next, or clicking the label at the counter resets to the first element.

The Save as Html option saves the image with all the stepping functionalty for offline reference.

Other options include opening in the browser and saving as Json, a light/dark mode toggle and a case toggle for Pascall vs Camel case.

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

- `out/` - Compiled JavaScript output

## License

MIT
