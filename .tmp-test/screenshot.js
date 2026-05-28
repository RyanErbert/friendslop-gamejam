const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Capture console logs
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  
  await page.goto('http://localhost:3001');
  await page.waitForTimeout(1000);
  
  await page.fill('#name-input', 'TestBot');
  await page.click('#join-btn');
  
  await page.waitForTimeout(2000);
  
  // Open debug menu
  await page.keyboard.press('F3');
  await page.waitForTimeout(500);
  
  await page.screenshot({ path: 'screenshot.png' });
  await browser.close();
})();