export function runInSandbox(container, html) {
  const iframe = document.createElement('iframe');
  iframe.sandbox = 'allow-scripts';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';
  iframe.srcdoc = html;
  
  container.innerHTML = '';
  container.appendChild(iframe);
  return iframe;
}

export function createSandboxedPage(html, css = '', js = '') {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>${css}</style>
      </head>
      <body>
        ${html}
        <script>${js}</script>
      </body>
    </html>
  `;
}
