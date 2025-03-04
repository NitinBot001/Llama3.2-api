// Suppress the deprecation warning
process.env.NODE_NO_WARNINGS = '1';

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');

// URL of the JSON file containing tunnel information
const JSON_URL = 'https://raw.githubusercontent.com/NitinBot001/Audio-url-new-js/refs/heads/main/instance.json';

// Create Express application
const app = express();

// Function to fetch the latest tunnel URL from GitHub
async function getTargetUrl() {
  let attempts = 0;
  const maxAttempts = 5;
  const retryDelay = 3000; // 3 seconds between retries
  
  while (attempts < maxAttempts) {
    try {
      const response = await axios.get(JSON_URL);
      if (response.data && response.data.tunnel_url) {
        console.log(`Fetched new tunnel URL: ${response.data.tunnel_url}`);
        return response.data.tunnel_url;
      } else {
        console.error('tunnel_url not found in JSON file');
        
        if (attempts >= maxAttempts - 1) {
          throw new Error('tunnel_url not found in JSON after multiple attempts');
        }
      }
    } catch (error) {
      console.error(`Error fetching tunnel URL (attempt ${attempts + 1}/${maxAttempts}):`, error.message);
      
      if (attempts >= maxAttempts - 1) {
        throw error;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    attempts++;
  }
  
  throw new Error('Failed to get tunnel URL after multiple attempts');
}

// Variable to store the current tunnel URL
let currentTargetUrl = null;

// Function to create a proxy middleware
function createDynamicProxy() {
  return createProxyMiddleware({
    target: currentTargetUrl,
    changeOrigin: true,
    secure: false,
    logLevel: 'debug',

    // Remove specified headers before forwarding the request
    onProxyReq: (proxyReq, req, res) => {
      const headersToRemove = [
        'User-Agent',
        'Upgrade-Insecure-Requests',
        'sec-ch-ua',
        'sec-ch-ua-mobile',
        'sec-ch-ua-platform'
      ];

      headersToRemove.forEach(header => {
        proxyReq.removeHeader(header);
        proxyReq.removeHeader(header.toLowerCase()); // Ensure case insensitivity
      });

      // Add a custom header to prevent proxy detection
      proxyReq.setHeader('X-Pinggy-No-Screen', 'true');

      console.log(`Removed specified headers for request to: ${req.url}`);
    },

    // Ensure these headers are not exposed in the response
    onProxyRes: (proxyRes, req, res) => {
      res.removeHeader('User-Agent');
      res.removeHeader('Upgrade-Insecure-Requests');
      res.removeHeader('sec-ch-ua');
      res.removeHeader('sec-ch-ua-mobile');
      res.removeHeader('sec-ch-ua-platform');
    },

    // Handle errors dynamically
    onError: async (err, req, res) => {
      console.error('Proxy error:', err);

      try {
        const newUrl = await getTargetUrl();
        if (newUrl !== currentTargetUrl) {
          console.log(`Detected expired tunnel. Updating tunnel URL to: ${newUrl}`);
          currentTargetUrl = newUrl;
        }
      } catch (urlError) {
        console.error('Failed to update tunnel URL after proxy error:', urlError);
      }

      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Proxy error occurred. Refreshing tunnel, please try again shortly.');
    }
  });
}

// Middleware to check if tunnel URL is still working
app.use(async (req, res, next) => {
  if (!currentTargetUrl) {
    try {
      currentTargetUrl = await getTargetUrl();
      console.log(`Initial tunnel URL set to: ${currentTargetUrl}`);
    } catch (error) {
      console.error('Failed to get initial tunnel URL:', error);
      res.status(503).send('Service unavailable: Cannot determine tunnel URL');
      return;
    }
  }

  next();
});

// Setup and start the proxy server
async function setupProxy() {
  try {
    // Fetch the initial tunnel URL
    currentTargetUrl = await getTargetUrl();
    
    // Create proxy middleware
    const apiProxy = createDynamicProxy();

    // Use the proxy for all requests
    app.use('/', apiProxy);

    // Start the HTTP server
    app.listen(3000, () => {
      console.log('HTTP Proxy server listening on port 3000');
      console.log(`Proxying to: ${currentTargetUrl}`);
      console.log('Removing specified headers from all requests');
    });
  } catch (error) {
    console.error('Failed to start proxy server:', error);
    process.exit(1);
  }
}

// Start the proxy server
setupProxy();

// Periodically refresh the tunnel URL every 5 minutes
setInterval(async () => {
  try {
    const newUrl = await getTargetUrl();
    if (newUrl !== currentTargetUrl) {
      console.log(`Tunnel URL updated to: ${newUrl}`);
      currentTargetUrl = newUrl;
    }
  } catch (error) {
    console.error('Error during periodic tunnel URL refresh:', error);
  }
}, 5 * 60 * 1000);
