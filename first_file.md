Sun Apr 12 2026
....

** Issue **

- media-reader the merged output took only only one channel of audio.
- There are 4 independent audio channels in the original file.

...

- I beleive this is how to read some of the sony xml file:

Sony Timecode starts timecode starts:
Capture Date, end : lastUpdate. The but these end in whole seconds
Duration: @\_value: "710" are the whole frame count starting at 0 ending at 709 >> LtcChange[0]: @\_frameCount: "0"
LtcChange[1]: @\_frameCount: "709" Math 709/ 29.97 = 23.6569 seconds or 23.20 seconds and 20 frames.

- I do not know what the @\_values in LtcChange mean.
- Also is any of this data on the MXF file?

...

**_ Task _**

- VideoPlayer.tsx - Review the code and make sure it is efficient and well-organized.

- The The timecode in the top right corcer UI shows the wrong Time Code given our recent update this should updated as well. This also may need a utility function update for the time code.
- The timeline should show hashes to indicate 5 second marks and 10 second marks.
- the Timeline indicator should show the elased time in the UI under the timecode.

- from the main UI the user clicks on a clip and it opens the video player. The video player opens to the full viewport hiding the player controls on the bottom. This player + controls should fill the view port.
- Add user an option for full screen with controls at the bottom and a button to return back to previous screen size. These controls can be buttons on the screen.

- Read this back to me and confirm you understand the tasks.

...
**_ Task _**

- Redesign the UI for the app.
- The styling should have these base text structures:
  - Font Families; No more than 2 distinct font families.
  - 5 Font Sizes Header, Subheader, Paragrapher/Line/ Data Text, Special use text ie dates, timecodes, etc.
  - 2 Font Weights; Bold, Regular.
  - App White is #F5F5F5, App Black is #111111
  - Contrast is important. Most Text Color should be
