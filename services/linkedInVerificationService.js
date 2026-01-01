const axios = require('axios');

/**
 * LinkedIn Credential Verification Service
 * Verifies LinkedIn credentials by attempting login
 */
class LinkedInVerificationService {
  constructor() {
    this.linkedInLoginUrl = 'https://www.linkedin.com/login';
    this.linkedInApiUrl = 'https://www.linkedin.com/voyager/api';
  }

  /**
   * Verify LinkedIn credentials by attempting login
   * Note: This is a simplified verification. In production, you might need
   * to use a headless browser or LinkedIn API for proper verification.
   * 
   * @param {String} email - LinkedIn email
   * @param {String} password - LinkedIn password
   * @returns {Promise<Object>} Verification result with session data if successful
   */
  async verifyCredentials(email, password) {
    try {
      // Create a session to attempt login
      const session = axios.create({
        withCredentials: true,
        maxRedirects: 0,
        validateStatus: (status) => status < 400,
      });

      // Step 1: Get login page to retrieve CSRF token and cookies
      const loginPageResponse = await session.get(this.linkedInLoginUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      // Extract CSRF token from login page (simplified - in production, parse HTML properly)
      const csrfToken = this.extractCSRFToken(loginPageResponse.data);
      const cookieData = this.extractCookies(loginPageResponse.headers['set-cookie'] || []);
      const cookies = cookieData.object || {};
      const cookieString = cookieData.string || '';

      if (!csrfToken) {
        throw new Error('Could not retrieve CSRF token from LinkedIn');
      }

      // Step 2: Attempt login
      const loginData = new URLSearchParams({
        session_key: email,
        session_password: password,
        csrfToken: csrfToken,
      }).toString();

      const loginResponse = await session.post(
        'https://www.linkedin.com/checkpoint/lg/login-submit',
        loginData,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': this.linkedInLoginUrl,
            'Cookie': cookieString,
          },
          maxRedirects: 5,
        }
      );

      // Check if login was successful
      // LinkedIn redirects on successful login or shows error page
      const isSuccess = this.checkLoginSuccess(loginResponse);

      if (isSuccess) {
        // Extract session cookies
        const sessionCookieData = this.extractCookies(loginResponse.headers['set-cookie'] || []);
        const sessionCookies = sessionCookieData.object || {};
        const finalCookies = { ...cookies, ...sessionCookies };
        const finalCookieString = sessionCookieData.string || cookieString;

        return {
          success: true,
          message: 'Credentials verified successfully',
          sessionData: {
            cookies: finalCookies,
            cookieString: finalCookieString,
            csrfToken: csrfToken,
            verifiedAt: new Date().toISOString(),
          },
        };
      } else {
        return {
          success: false,
          message: 'Invalid credentials. Please check your email and password.',
          sessionData: null,
        };
      }
    } catch (error) {
      console.error('LinkedIn verification error:', error);
      
      // If it's a network error or LinkedIn blocks automated access
      if (error.response?.status === 403 || error.code === 'ECONNREFUSED') {
        return {
          success: false,
          message: 'LinkedIn blocked automated access. Please verify credentials manually by logging in.',
          requiresManualVerification: true,
          sessionData: null,
        };
      }

      return {
        success: false,
        message: error.message || 'Failed to verify credentials. Please try again.',
        sessionData: null,
      };
    }
  }

  /**
   * Extract CSRF token from HTML (simplified - in production use proper HTML parser)
   */
  extractCSRFToken(html) {
    const csrfMatch = html.match(/name="csrfToken"\s+value="([^"]+)"/) ||
                     html.match(/csrfToken["\s]*[:=]["\s]*([^"'\s]+)/);
    return csrfMatch ? csrfMatch[1] : null;
  }

  /**
   * Extract cookies from set-cookie headers
   */
  extractCookies(setCookieHeaders) {
    if (!setCookieHeaders || !Array.isArray(setCookieHeaders)) {
      return {};
    }

    const cookies = {};
    const cookieStringArray = [];
    
    setCookieHeaders.forEach(cookie => {
      const [nameValue] = cookie.split(';');
      const [name, value] = nameValue.split('=');
      if (name && value) {
        const trimmedName = name.trim();
        const trimmedValue = value.trim();
        cookies[trimmedName] = trimmedValue;
        cookieStringArray.push(`${trimmedName}=${trimmedValue}`);
      }
    });
    
    // Return both object and string format
    return {
      object: cookies,
      string: cookieStringArray.join('; '),
    };
  }

  /**
   * Check if login was successful based on response
   */
  checkLoginSuccess(response) {
    // LinkedIn redirects to feed or shows error
    const location = response.headers.location || '';
    const isRedirect = response.status >= 300 && response.status < 400;
    const isFeedRedirect = location.includes('/feed') || location.includes('/voyager');
    const hasError = response.data?.includes?.('error') || response.data?.includes?.('incorrect');

    return isRedirect && isFeedRedirect && !hasError;
  }

  /**
   * Verify LinkedIn session cookies by making a test request
   * @param {String} cookieString - Cookie string from browser
   * @returns {Promise<Object>} Verification result
   */
  async verifySessionCookies(cookieString) {
    try {
      // Test if session is valid by accessing LinkedIn feed
      const testResponse = await axios.get('https://www.linkedin.com/feed/', {
        headers: {
          'Cookie': cookieString,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
      });

      // Check if we got redirected to login (session invalid) or got feed (session valid)
      const finalUrl = testResponse.request.res.responseUrl || testResponse.config.url;
      const isSessionValid = testResponse.status === 200 && 
                            !finalUrl.includes('/login') &&
                            (testResponse.data?.includes?.('feed') || 
                             testResponse.data?.includes?.('voyager') ||
                             testResponse.data?.includes?.('mynetwork'));

      if (isSessionValid) {
        return {
          success: true,
          message: 'Session cookies are valid',
          valid: true,
        };
      } else {
        return {
          success: false,
          message: 'Session cookies are invalid or expired',
          valid: false,
        };
      }
    } catch (error) {
      console.error('Session verification error:', error);
      return {
        success: false,
        message: error.message || 'Failed to verify session cookies',
        valid: false,
      };
    }
  }
}

module.exports = new LinkedInVerificationService();


