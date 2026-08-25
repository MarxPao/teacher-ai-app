import asyncio
from playwright.async_api import async_playwright

async def debug():
    p = await async_playwright().start()
    b = await p.chromium.launch(channel='chrome', headless=True)
    page = await b.new_page()
    await page.goto("http://localhost:3000/sandbox/portal_mock_iframe.html")
    await page.wait_for_load_state("networkidle")
    
    print("Page frames count:", len(page.frames))
    for i, f in enumerate(page.frames):
        print(f"Frame {i}: name='{f.name}', url='{f.url}'")
        rows = await f.locator("tr").all()
        print(f"  Rows count: {len(rows)}")
        for r in rows:
            print("   Row text:", (await r.inner_text()).replace('\n', ' '))
            
    await b.close()
    await p.stop()

asyncio.run(debug())
