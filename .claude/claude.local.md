# Project Notes

## Overview

This extension is intended to present data from Json files in a user-friendly format. The original version of this was written by me in c#. This is simply an alternative way of viewing data in Json files.

The use cases include object dumps and other structured data that is hierarchical in nature. The goal is to allow the user to step through the data at multiple levels, with a compact representation that minimizes horizontal scrolling.
This presentation allows clear understanding of the data structure, and easy navigation through the data. This is intended for targeted data sets (for example run-time values of an object, configuration data, or sql query results "for json auto") rather than vast data sets like logs. The motivation is clarity of structure and content, not huge data volumes.

The reason to include the javascript and css is to allow these files to be self-sufficient on disk, without dependencies on external libraries or internet access. This allows easy sharing of the files and use in secure environments and persistence for use in the browser when the json is nolonger available.

## Requirements

With reference to the html sample in the .data folder, the data is simply read from a json object file and represented in table form, with css styling for light or dark modes.
The html contains javascript to allow the user to step through the data at multiple levels. The data is presented in a simple vertical format that reduces scrolling and handles nested structures.
The top row should contain the name of the object being viewed, and we will probably add a couple of buttons next to this to handle commands like dark/light mode.

The way data is presented is:
Typically each element is shown as two elements side by side, the name of the element on the left, and the value on the right.
If the value is a simple type (string, number, boolean) it is shown directly.
If the value is an array, then the value shows the current and total number of elements in the array, e.g 1/11. The properties of the array are shown below, without indentation.
Clicking on the array name reverts to the first element, clicking any other title steps to the next element in the array (with wrap).
Every time there is an object, its name is show, then the names of the properties and their values are shown in two columns nested inside the value.
This allows presentation of all the data, and its hierarchy, without excessive scrolling, in a relatively compact manner.
If any of the data is very long, it is truncated with ... and the full data is shown in a tooltip on hover.

We will necessarily refine the presentation as we go along, but this is the basic idea. Only indent when nested property or array, minimize the horizontal spread while still showing the hierarchy clearly. avoid horizontal scrolling whenever possible.

## Implementation Notes

As implemented in the sample, I used nested tables to represent the data. The unfortunate side-effect of the way I did that is that each time there is an array, the title of the array is repeated with the current/count: this is redundant and simply indenting a small amount would be less wasteful of the horizontal space.

Similarly, when there is a nested object, if we treated that the same way as an array, with no current/count, perhaps that would be more consistent and would save horizontal space and hopefully avoid horizontal scrolling.

As currently implemented, it is hard to recognize the indentation level: if we go the route of using a standard indent as describedabove we could include a vertical pipe character, or a left border element that would help recognize the hierarchy.

The json should always be well-formed, but if the json has missing elements, this should be handled gracefully and the errors simply noted in the output.

## Data Files

Sample data is located in the `.data/` folder.
The test-first.html file is a sample of the output as this was optionally implemented in the C# version.
The test-html.Json is a sample of the type of data that was being viewed in the C# version.
The upstream.json file is a simple sample to work with.

I will add some data as we go along to test various aspects of the viewer, but this is enough to get us started.