# SecuriScanX

**SecuriScanX** is a lightweight, real-time web vulnerability scanner built as a Chrome extension. It allows developers and security professionals to quickly detect common web vulnerabilities like **SQL Injection (SQLi)**, **Cross-Site Scripting (XSS)**, and **Command Injection (CMDi)** directly within the browser.

---



## ⭐ Features

- **Real-time detection of SQLi, XSS & CMDi**  
  Identifies SQL errors, XSS reflections, and command-execution indicators using safe payloads.

- **Modern, user-friendly popup interface**  
  Start scans, filter results, export data, and browse history with a clean UI.

- **Smart result tags**  
  Results categorized as **SAFE**, **VULNERABLE**, **SUSPICIOUS**, or **FAILED** — with color‑coded highlights.

- **Complete scan history**  
  Stores URLs, timestamps, and payload results with expandable session cards and delete/export options.

- **Export results to Excel (.xls)**  
  Generates structured reports with metadata and formatted payloads for analysis.

- **100% client-side scanning**  
  No backend servers. All data stays inside your browser for maximum privacy.

- **Lightweight & fast**  
  Powered by Manifest V3 + `chrome.scripting` for efficient performance.

- **Auto-detects visible inputs**  
  Targets only editable, visible inputs to avoid noise and improve accuracy.

- **Built-in error & reflection detection**  
  Uses regex patterns and payload reflection checks for SQLi, XSS, and CMDi.

---



## Installation (Developer Mode)

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/sashiprabhaktk/SecuriScanX.git
2. Open **Chrome** and navigate to `chrome://extensions/`.

3. Enable **Developer Mode** (toggle switch in the top-right corner).

4. Click **Load unpacked** and select the folder where the extension is saved.

5. The **SecuriScanX** icon should now appear in your Chrome toolbar.

---



## Usage

1. Click the **SecuriScanX** icon in Chrome to open the popup.

2. **Login / Signup / Forgot Password**:

   * New users can sign up directly in the popup.
   * Returning users can log in using their credentials.
   * Forgot password functionality is available for account recovery.

3. **Start a Scan**:

   * Navigate to the page you want to test.
   * Click **Start Scan** in the popup.
   * The extension will automatically detect form inputs and inject safe test payloads to identify vulnerabilities.

4. **View Results**:

   * Results appear in a **table** showing Status, Type, Target, and Payload.
   * Use the **Filter** dropdown to view specific result types.

5. **Export Results**:

   * Click **Export Results** to download scan results in an Excel-compatible `.xls` file.

6. **Scan History**:

   * Click the **History** button to view previous scans.
   * Each session can be exported or deleted.

---



## File Overview

| File               | Purpose                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `manifest.json`    | Chrome extension manifest, defines permissions and popup.        |
| `popup.html`       | User interface for login, scanning, and history.                 |
| `popup.js`         | Handles UI interactions, session management, and scan execution. |
| `background.js`    | Background service worker managing extension-level events.       |
| `contentScript.js` | Injected into web pages to test inputs for vulnerabilities.      |
| `popup.css`        | Styles for the popup UI (not included in this upload).           |

---



## Security Notes

* All scanning is performed **client-side**; no sensitive data is sent externally.
* Only **safe, predefined payloads** are used for testing.
* Use on websites you **own or have explicit permission** to test.

---



## Contact

**Contributors:**

- **Sashiprabha KTK** — *Cyber with KT*  
  [![GitHub](https://img.shields.io/badge/GitHub-000000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/sashiprabhaktk)  
  [![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/sashiprabhaktk/)

- **Samudu Basnayaka**  
  [![GitHub](https://img.shields.io/badge/GitHub-000000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Samudubaz)  
  [![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/samudu-basnayaka/)

- **Chalana Madhushanka**  
  [![GitHub](https://img.shields.io/badge/GitHub-000000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Chalana569)  
  [![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/chalana-madhushanka-a3a979249/)


