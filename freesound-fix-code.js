// FIX FOR FREESOUND API FIELDS PARAMETER ISSUE
// Replace the existing /api/freesound endpoint in your server.js file

app.get('/api/freesound', async (req, res) => {
  const { url, ...otherParams } = req.query;
  
  // Build the full URL with ALL parameters including 'fields'
  const queryString = new URLSearchParams(otherParams).toString();
  const freesoundUrl = `https://freesound.org/apiv2/${url}${queryString ? '&' + queryString : ''}`;
  
  console.log('🔧 Freesound proxy URL:', freesoundUrl);
  
  try {
    const response = await fetch(freesoundUrl, {
      headers: {
        'Authorization': `Token ${process.env.FREESOUND_API_KEY}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Freesound API error: ${response.status}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('❌ Freesound proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// END OF FIX 