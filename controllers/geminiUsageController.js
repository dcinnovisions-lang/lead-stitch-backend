const geminiUsageService = require('../services/geminiUsageService');

/**
 * Get comprehensive usage data
 * GET /api/gemini-usage?timeRange=28d
 */
exports.getUsage = async (req, res) => {
  try {
    const { timeRange = '28d' } = req.query;

    // Validate timeRange
    const validTimeRanges = ['1h', '1d', '7d', '28d', '90d'];
    if (!validTimeRanges.includes(timeRange)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid timeRange. Must be one of: 1h, 1d, 7d, 28d, 90d',
      });
    }

    const usageData = await geminiUsageService.getUsage(timeRange);

    res.json({
      success: true,
      data: usageData,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching usage data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage data',
      message: error.message,
    });
  }
};

/**
 * Get usage summary
 * GET /api/gemini-usage/summary
 */
exports.getUsageSummary = async (req, res) => {
  try {
    const summary = await geminiUsageService.getUsageSummary();

    res.json({
      success: true,
      data: {
        summary,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching usage summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage summary',
      message: error.message,
    });
  }
};

/**
 * Get billing information
 * GET /api/gemini-usage/billing
 */
exports.getBilling = async (req, res) => {
  try {
    const billingInfo = await geminiUsageService.getBillingInfo();

    res.json({
      success: true,
      data: billingInfo,
      timestamp: new Date().toISOString(),
      note: 'For detailed billing information, visit: https://aistudio.google.com/u/0/usage',
    });
  } catch (error) {
    console.error('Error fetching billing info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch billing information',
      message: error.message,
    });
  }
};

