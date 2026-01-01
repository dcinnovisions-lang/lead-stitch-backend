// Gemini Usage Tracking Service
// Tracks API usage for Gemini API calls

// In-memory usage tracking (fallback when Google Cloud Monitoring is unavailable)
const localUsageTracking = {
  totalRequests: 0,
  requestsByDate: {},
  recentCalls: [],
};

// Free tier limits
const FREE_TIER_LIMITS = {
  dailyLimit: 1500,
  monthlyLimit: 50000,
  rateLimit: 15, // requests per minute
};

/**
 * Track a local API call
 */
exports.trackLocalUsage = (model, tokens) => {
  const now = new Date();
  const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const hourKey = now.toISOString().split(':')[0] + ':00:00'; // YYYY-MM-DDTHH:00:00

  // Update total requests
  localUsageTracking.totalRequests += 1;

  // Initialize date entry if needed
  if (!localUsageTracking.requestsByDate[dateKey]) {
    localUsageTracking.requestsByDate[dateKey] = {
      count: 0,
      models: {},
      hourlyCounts: {},
    };
  }

  // Update daily count
  localUsageTracking.requestsByDate[dateKey].count += 1;

  // Update model usage
  if (!localUsageTracking.requestsByDate[dateKey].models[model]) {
    localUsageTracking.requestsByDate[dateKey].models[model] = 0;
  }
  localUsageTracking.requestsByDate[dateKey].models[model] += 1;

  // Update hourly count
  if (!localUsageTracking.requestsByDate[dateKey].hourlyCounts[hourKey]) {
    localUsageTracking.requestsByDate[dateKey].hourlyCounts[hourKey] = 0;
  }
  localUsageTracking.requestsByDate[dateKey].hourlyCounts[hourKey] += 1;

  // Add to recent calls (keep last 100)
  localUsageTracking.recentCalls.unshift({
    timestamp: now.toISOString(),
    model: model || 'unknown',
    tokens: tokens || {},
  });

  // Keep only last 100 recent calls
  if (localUsageTracking.recentCalls.length > 100) {
    localUsageTracking.recentCalls = localUsageTracking.recentCalls.slice(0, 100);
  }
};

/**
 * Get local usage data
 */
exports.getLocalUsage = (timeRange = '28d') => {
  const now = new Date();
  let startDate;

  // Calculate start date based on time range
  switch (timeRange) {
    case '1h':
      startDate = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case '1d':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '28d':
      startDate = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  }

  // Filter requests by date range
  const filteredRequestsByDate = {};
  let totalRequests = 0;

  Object.keys(localUsageTracking.requestsByDate).forEach((dateKey) => {
    const date = new Date(dateKey);
    if (date >= startDate) {
      filteredRequestsByDate[dateKey] = localUsageTracking.requestsByDate[dateKey];
      totalRequests += localUsageTracking.requestsByDate[dateKey].count;
    }
  });

  // Filter recent calls
  const filteredRecentCalls = localUsageTracking.recentCalls.filter((call) => {
    const callDate = new Date(call.timestamp);
    return callDate >= startDate;
  });

  return {
    totalRequests,
    requestsByDate: filteredRequestsByDate,
    recentCalls: filteredRecentCalls.slice(0, 20), // Return last 20
  };
};

/**
 * Get cloud usage from Google Cloud Monitoring (if available)
 */
exports.getCloudUsage = async (timeRange = '28d') => {
  // TODO: Implement Google Cloud Monitoring integration
  // This would require:
  // 1. Google Cloud SDK setup
  // 2. Service account with Monitoring Viewer role
  // 3. Project ID configuration
  // 4. Query Cloud Monitoring API for Gemini API metrics

  // For now, return null to indicate cloud monitoring is not available
  return null;
};

/**
 * Calculate free tier status
 */
exports.getFreeTierStatus = (usageData) => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentMonth = now.toISOString().substring(0, 7); // YYYY-MM

  // Calculate daily usage
  let dailyUsage = 0;
  if (usageData?.localUsage?.requestsByDate?.[today]) {
    dailyUsage = usageData.localUsage.requestsByDate[today].count;
  } else if (usageData?.cloudUsage?.dailyUsage?.[today]) {
    dailyUsage = usageData.cloudUsage.dailyUsage[today];
  }

  // Calculate monthly usage
  let monthlyUsage = 0;
  if (usageData?.localUsage?.requestsByDate) {
    Object.keys(usageData.localUsage.requestsByDate).forEach((dateKey) => {
      if (dateKey.startsWith(currentMonth)) {
        monthlyUsage += usageData.localUsage.requestsByDate[dateKey].count;
      }
    });
  } else if (usageData?.cloudUsage?.dailyUsage) {
    Object.keys(usageData.cloudUsage.dailyUsage).forEach((dateKey) => {
      if (dateKey.startsWith(currentMonth)) {
        monthlyUsage += usageData.cloudUsage.dailyUsage[dateKey];
      }
    });
  }

  const dailyLimit = FREE_TIER_LIMITS.dailyLimit;
  const monthlyLimit = FREE_TIER_LIMITS.monthlyLimit;

  return {
    dailyUsage,
    dailyLimit,
    dailyRemaining: Math.max(0, dailyLimit - dailyUsage),
    dailyLimitExceeded: dailyUsage > dailyLimit,
    monthlyUsage,
    monthlyLimit,
    monthlyRemaining: Math.max(0, monthlyLimit - monthlyUsage),
    monthlyLimitExceeded: monthlyUsage > monthlyLimit,
  };
};

/**
 * Get comprehensive usage data
 */
exports.getUsage = async (timeRange = '28d') => {
  try {
    // Try to get cloud usage first
    const cloudUsage = await exports.getCloudUsage(timeRange);

    // Get local usage
    const localUsage = exports.getLocalUsage(timeRange);

    // Determine data source
    const isUsingCloud = cloudUsage !== null;

    // Combine usage data
    const usageData = {
      timeRange,
      cloudUsage: cloudUsage || null,
      localUsage: localUsage || null,
      freeTierInfo: {
        dailyLimit: FREE_TIER_LIMITS.dailyLimit,
        monthlyLimit: FREE_TIER_LIMITS.monthlyLimit,
      },
      recommendation: isUsingCloud
        ? 'Using Google Cloud Monitoring for accurate usage data.'
        : 'Using local tracking. Enable Google Cloud Monitoring for accurate data.',
    };

    // Calculate free tier status
    usageData.freeTierStatus = exports.getFreeTierStatus(usageData);

    return usageData;
  } catch (error) {
    console.error('Error getting usage data:', error);
    // Return local usage as fallback
    const localUsage = exports.getLocalUsage(timeRange);
    return {
      timeRange,
      cloudUsage: null,
      localUsage,
      freeTierInfo: {
        dailyLimit: FREE_TIER_LIMITS.dailyLimit,
        monthlyLimit: FREE_TIER_LIMITS.monthlyLimit,
      },
      freeTierStatus: exports.getFreeTierStatus({ localUsage }),
      recommendation: 'Error fetching cloud usage. Using local tracking data.',
    };
  }
};

/**
 * Get usage summary
 */
exports.getUsageSummary = async () => {
  try {
    const usageData = await exports.getUsage('28d');
    const totalRequests = usageData.cloudUsage?.totalRequests || usageData.localUsage?.totalRequests || 0;

    return {
      totalRequests,
      freeTierStatus: usageData.freeTierStatus,
    };
  } catch (error) {
    console.error('Error getting usage summary:', error);
    const localUsage = exports.getLocalUsage('28d');
    return {
      totalRequests: localUsage?.totalRequests || 0,
      freeTierStatus: exports.getFreeTierStatus({ localUsage }),
    };
  }
};

/**
 * Get billing information
 */
exports.getBillingInfo = async () => {
  try {
    // TODO: Implement Google Cloud Billing API integration
    // This would require:
    // 1. Google Cloud SDK setup
    // 2. Service account with Billing Viewer role
    // 3. Query Cloud Billing API

    // For now, return free tier status
    return {
      hasBilling: false,
      message: 'No billing account linked. You are using the free tier.',
      billingAccountName: null,
    };
  } catch (error) {
    console.error('Error getting billing info:', error);
    return {
      hasBilling: false,
      message: 'Unable to fetch billing information.',
      billingAccountName: null,
    };
  }
};

