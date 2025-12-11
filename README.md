# Json Visualizer

(This is a port of my JsonToHtml C# class).

## Overview

Allows compact visualization of nested Json data structures. 

It can be opened from the toolbar when a Json document is in the editor, or can be launched with `Json Visualizer from Clipboard (JSON/TSV/CSV)` to show data from the clipboard. 

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
(If it is unable to capture, right-click the last output in the debug console and copy to the clipboard, then use the `to-json-visual-from-clip` command)

(Hint: I have the js/ts and cs commands bound to the same shortcut key but different languages)

The command `Json Visualizer: Visualize at Breakpoints` allows you to automatically dump json when encountering a breakpoint on an assignment line or a return which returns a variable.
It only works on conditional breakpoints where the condition is "99==99".
If the breakpoint is on a line like `var x = await DoY(...` the code will break at the following line instead, which allows the variabe to be populated. 
If the breakpoint is on a line like `return x` it will break on the line, and dump the data. This alows the data to be modified, then the `Json Visualizer: Inject into degugger` command can be used to return the modified data for return (there is also an icon button at the top of the json file to do this).
the command `Json Visualizer: Stop Visualizing from Breakpoints` can be used to stop this. 
Note: capture scenarios other than those mentioned above are not supported: the automation needs to be able to recognize the variable to capture from the simple pattern.

The `Json Visualizer: Inject into Selected variable` toolbar command can be used in a similar manner to populate a named variable while paused at a breakpoint. This allows `to-debug...` captures to be reinjected later. The json file needs to be focused at the time.

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
