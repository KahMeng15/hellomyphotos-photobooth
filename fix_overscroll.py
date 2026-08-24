import os

filepath = 'photobooth-server/frontend/src/styles/main.css'
with open(filepath, 'r') as f:
    content = f.read()

# Replace html and body background
html_block_old = """html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}"""
html_block_new = """html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: var(--color-surface); /* Top overscroll matches topbar */
}"""

content = content.replace(html_block_old, html_block_new)

body_block_old = """body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.5;
  background: var(--color-bg);
  color: var(--color-text);
}"""
body_block_new = """body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.5;
  background-color: var(--color-bg);
  color: var(--color-text);
  /* Ensure #app takes full height so body background paints correctly */
  min-height: 100vh; 
}

#app {
  min-height: 100vh;
  background-color: var(--color-bg);
}"""

content = content.replace(body_block_old, body_block_new)

with open(filepath, 'w') as f:
    f.write(content)

print("Fixed overscroll color.")
