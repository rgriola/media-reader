# Premiere UXP Panel + Media Encoder Project Plan

**Goal:**  
Build a UXP panel for Premiere that detects a camera card, imports and merges clips into a sequence, and uses Adobe Media Encoder (AME) for export.

---

## Steps

1. **Requirements & Research**
   - Identify supported camera card types (e.g., Sony XAVC, AVCHD).
   - Review UXP and Premiere scripting APIs for import, sequence creation, and AME export.

2. **UI/UX Design**
   - Panel with “Select Source Folder” button, status/progress display.
   - Confirmation dialog when a camera card is detected.
   - Option to review/override detected clips.

3. **Development**
   - Implement folder picker and file system access in UXP.
   - Add camera card detection logic (scan for known folder/file patterns).
   - Display confirmation and summary of detected clips.
   - Script import of video files into a new bin.
   - Script creation of a new sequence and placement of clips end-to-end.
   - Script export of the sequence to AME with predefined settings.

4. **Testing**
   - Test with real camera cards and various clip counts.
   - Test on both macOS and Windows.
   - Test AME export workflow and error handling.

5. **Documentation & Deployment**
   - Write user guide and troubleshooting tips.
   - Package for internal distribution as a UXP plugin.
