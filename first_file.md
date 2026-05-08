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

- Redesign the UI for the app, first narrow our styling guide.
- Use Tailwind CSS for styling.
- The styling should have these base text structures:
  - Font Families; No more than 2 distinct font families, please declare these families.
  - Use HEX Colors #XXXXXX for all colors.
  - 5 Font Sizes Header, Subheader, Paragrapher/Line/ Data Text, Special use text ie dates, timecodes, etc.
  - 2 Font Weights; Bold, Regular.
  - App White is #F5F5F5, App Black is #111111, Font Text Colors are the same.
  - Contrast is important. White Text should be on dark background and Black Text should be on light background. Black on gray color ranges are hard for humans to read as well as White text on light backgrounds.
  - Alerts should be Red, Yellow, Green as needed.
  - limit the use of inline styles, this is for maintence and readability.
  - Please read this back, evaluate the project and I will confirm the changes.

...
**_ Issue _**

- Sony FX6 Card is not being recognized as a Sony Card in the App.
  Note: Sony recently updated the camera firmward and I believe slightly changed the file structure on the card.
- We also need a way to idenify the the camera model if the user did not format the card prior to recording. I did this with using a Sony A7s III, then put that card into my FX6, the FX6 still recorded on the card but our reader did not recognzie it.
- I have a fresh formatted card from the new firmware with 3 video clips and 3 proxy's and thumbnails ready to test.

...
**_ Task _**

- the Sony A7sIII camera; does not shoot .MXF files its all .MP4 both the main and proxy files.
- Here the A7sIII files are being run through MXF stream even though they do not need this processing.

- The Reader should sample the file being played back and route its playback appropriately for the file type, not just pushing to MXF stream.

- Check the Merge File processing for the same, that .MP4 is being processed as .MP4 and not convered.
- Make sure the Main File is displayed or the option for Full File MP4 is avail or Proxy Viewing.
