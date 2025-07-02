#!/bin/bash

# Fix for Freesound API fields parameter issue
# This script will help you apply the fix to your audiomosh-proxy service

echo "🔧 Fixing Freesound API fields parameter issue..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: This script should be run from the audiomosh-proxy directory"
    echo "Please run: cd ../audiomosh-proxy && bash ../audiomosh/fix-proxy-service.sh"
    exit 1
fi

# Check if server.js exists
if [ ! -f "server.js" ]; then
    echo "❌ Error: server.js not found in current directory"
    echo "Please run this script from the audiomosh-proxy directory"
    exit 1
fi

echo "📁 Found server.js, applying fix..."

# Create backup
cp server.js server.js.backup
echo "✅ Created backup: server.js.backup"

# Create the fixed Freesound endpoint
cat > freesound-endpoint-fix.js << 'EOF'
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
EOF

echo "✅ Created fix file: freesound-endpoint-fix.js"

# Instructions for manual application
echo ""
echo "📋 MANUAL STEPS REQUIRED:"
echo "1. Open server.js in your editor"
echo "2. Find the existing /api/freesound endpoint"
echo "3. Replace it with the content from freesound-endpoint-fix.js"
echo "4. Save the file"
echo "5. Test with: curl -s \"https://evermosh-proxy-service.onrender.com/api/freesound?url=search/text/?query=ambient&page_size=1&fields=id,name,previews\" | jq '.results[0] | {id, name, hasPreviews: (.previews != null), previewKeys: (.previews | keys)}'"
echo "6. Commit and push the changes"
echo "7. Deploy to Render"
echo ""
echo "🎯 The fix will forward the 'fields' parameter to the Freesound API,"
echo "   which will include the 'previews' field with audio URLs." 