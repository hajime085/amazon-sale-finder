// Tab Switching
function switchTab(tab) {
  const searchTab = document.getElementById('searchTab');
  const urlTab = document.getElementById('urlTab');
  const buttons = document.querySelectorAll('.tab-btn');
  
  if (tab === 'search') {
    searchTab.style.display = 'flex';
    urlTab.style.display = 'none';
    buttons[0].style.color = 'var(--tx)';
    buttons[0].style.borderBottomColor = 'var(--am)';
    buttons[1].style.color = 'var(--mu)';
    buttons[1].style.borderBottomColor = 'transparent';
  } else {
    searchTab.style.display = 'none';
    urlTab.style.display = 'flex';
    buttons[0].style.color = 'var(--mu)';
    buttons[0].style.borderBottomColor = 'transparent';
    buttons[1].style.color = 'var(--tx)';
    buttons[1].style.borderBottomColor = 'var(--am)';
  }
}

// Scrape Product from URL
async function scrapeProduct() {
  const url = document.getElementById('productUrl').value.trim();
  if (!url) {
    toast('URLを入力してください', 1);
    return;
  }

  const btn = document.getElementById('scrapeBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="sp"></span> 解析中...';

  try {
    const response = await fetch('/.netlify/functions/scrape-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await response.json();

    if (!response.ok) {
      toast(data.error || '解析に失敗しました', 1);
      return;
    }

    const product = data.product;
    allItems = [product];
    renderResults();
    toast('商品情報を取得しました！');
    document.getElementById('resultsArea').scrollIntoView({ behavior: 'smooth' });

  } catch(e) {
    toast(e.message, 1);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🔍 URLを解析';
  }
}
