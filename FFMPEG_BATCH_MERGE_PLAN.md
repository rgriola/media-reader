# FFmpeg Batch Merge Project Plan

**Goal:**  
Build a script or small app that detects a camera card, merges all video clips into one file using FFmpeg, and outputs the result for import into any NLE.

**_ Presets _**

- Take native video format and all clips to one contiguos file of the same quaility

---

## Steps

1. **Requirements & Research**
   - Identify supported camera card types and folder structures.
   - Review FFmpeg concat methods for compatible and mixed formats.

2. **Script/App Design**
   - Command-line script or minimal GUI.
   - User selects the camera card root folder.
   - Script detects and lists all video files in order.

3. **Development**
   - Implement camera card detection logic.
   - Generate a file list for FFmpeg concat.
   - Run FFmpeg to merge clips:
     - For compatible files:  
       ffmpeg -f concat -safe 0 -i filelist.txt -c copy output.mp4
     - For mixed formats:  
       ffmpeg -i input1 -i input2 ... -filter_complex "[0:v][0:a][1:v][1:a]...concat=n=2:v=1:a=1" output.mp4
   - Output merged file to user-specified location.

4. **Testing**
   - Test with various camera cards and file types.
   - Test for error handling (missing files, format mismatches).

5. **Documentation & Distribution**
   - Write usage instructions.
   - Package as a script or simple app for newsroom use.
