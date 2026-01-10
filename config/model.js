require('dotenv').config();

const { Sequelize } = require('sequelize');

const DB_NAME = process.env.DB_NAME;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_HOST = process.env.DB_HOST;
const DB_PORT = parseInt(process.env.DB_PORT);

global.Op = Sequelize.Op;

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    port: DB_PORT,
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
        statement_timeout: 200000,
        idle_in_transaction_session_timeout: 60000
    },
    define: {
        freezeTableName: true,  // Prevents Sequelize from pluralizing table names
        underscored: true        // Uses snake_case for column names (already using this)
    },
    pool: {
        max: parseInt(process.env.DB_POOL_MAX || '40', 10),
        min: parseInt(process.env.DB_POOL_MIN || '5', 10),
        acquire: parseInt(process.env.DB_POOL_ACQUIRE || '300000', 10),
        idle: parseInt(process.env.DB_POOL_IDLE || '60000', 10)
    }
});

sequelize.authenticate().then(() => {
    // Database connection established - additional logs handled in redis.js and database.js
}).catch(error => {
    console.error('❌ Unable to connect to database:', error.message);
    process.exit(1); // Exit process on connection failure in production
});

var Users = sequelize.define('users', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    email: { type: Sequelize.STRING, unique: true, allowNull: false },
    password_hash: { type: Sequelize.STRING, allowNull: false },
    first_name: { type: Sequelize.STRING },
    last_name: { type: Sequelize.STRING },
    role: { type: Sequelize.ENUM('user', 'admin'), defaultValue: 'user', allowNull: false },
    is_active: { type: Sequelize.BOOLEAN, defaultValue: true, allowNull: false },
    is_email_verified: { type: Sequelize.BOOLEAN, defaultValue: false },
    approval_status: { type: Sequelize.ENUM('pending', 'approved', 'rejected'), defaultValue: 'pending', allowNull: false },
    approved_by: { type: Sequelize.UUID, allowNull: true },
    approved_at: { type: Sequelize.DATE, allowNull: true },
    rejection_reason: { type: Sequelize.TEXT, allowNull: true },
    last_login_at: { type: Sequelize.DATE, allowNull: true },
    suspended_at: { type: Sequelize.DATE, allowNull: true },
    otp: { type: Sequelize.STRING },
    otp_expires_at: { type: Sequelize.DATE },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var BusinessRequirements = sequelize.define('business_requirements', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    user_id: { type: Sequelize.UUID, allowNull: false },
    requirement_text: { type: Sequelize.TEXT, allowNull: false },
    industry: { type: Sequelize.STRING },
    product_service: { type: Sequelize.STRING },
    target_location: { type: Sequelize.STRING },
    target_market: { type: Sequelize.STRING },
    operation_name: { type: Sequelize.STRING },
    status: { type: Sequelize.STRING, defaultValue: 'draft' },
    decision_makers_finalized_at: { type: Sequelize.DATE, allowNull: true },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var DecisionMakerRoles = sequelize.define('decision_maker_roles', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    business_requirement_id: { type: Sequelize.UUID, allowNull: false },
    role_title: { type: Sequelize.STRING, allowNull: false },
    industry: { type: Sequelize.STRING },
    priority: { type: Sequelize.INTEGER, defaultValue: 0 },
    api_source: { type: Sequelize.STRING },
    raw_api_response: { type: Sequelize.JSONB },
    reasoning: { type: Sequelize.TEXT },
    industry_relevance: { type: Sequelize.STRING },
    confidence: { type: Sequelize.DECIMAL(3, 2) },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var LinkedInProfiles = sequelize.define('linkedin_profiles', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    business_requirement_id: { type: Sequelize.UUID },
    profile_url: { type: Sequelize.STRING, unique: true, allowNull: false },
    name: { type: Sequelize.STRING, allowNull: false },
    profession: { type: Sequelize.STRING },
    title: { type: Sequelize.STRING },
    location: { type: Sequelize.STRING },
    company_name: { type: Sequelize.STRING },
    company_url: { type: Sequelize.STRING },
    experience_details: { type: Sequelize.JSONB },
    decision_maker_role: { type: Sequelize.STRING },
    scraped_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var EmailAddresses = sequelize.define('email_addresses', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    linkedin_profile_id: { type: Sequelize.UUID },
    email: { type: Sequelize.STRING, allowNull: false },
    source: { type: Sequelize.STRING, defaultValue: 'apollo' },
    is_verified: { type: Sequelize.BOOLEAN, defaultValue: false },
    verification_date: { type: Sequelize.DATE },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var Campaigns = sequelize.define('campaigns', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    user_id: { type: Sequelize.UUID, allowNull: false },
    name: { type: Sequelize.STRING, allowNull: false },
    description: { type: Sequelize.TEXT },
    status: { type: Sequelize.STRING, defaultValue: 'draft' },
    scheduled_at: { type: Sequelize.DATE },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var CampaignRecipients = sequelize.define('campaign_recipients', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    campaign_id: { type: Sequelize.UUID, allowNull: false },
    linkedin_profile_id: { type: Sequelize.UUID },
    email_address_id: { type: Sequelize.UUID },
    lead_id: { type: Sequelize.UUID },
    email: { type: Sequelize.STRING },
    name: { type: Sequelize.STRING },
    status: { type: Sequelize.STRING, defaultValue: 'pending' },
    sent_at: { type: Sequelize.DATE },
    delivered_at: { type: Sequelize.DATE },
    opened_at: { type: Sequelize.DATE },
    clicked_at: { type: Sequelize.DATE },
    replied_at: { type: Sequelize.DATE },
    bounced_at: { type: Sequelize.DATE },
    error_message: { type: Sequelize.TEXT },
    personalization_data: { type: Sequelize.JSONB },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var EmailTemplates = sequelize.define('email_templates', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    user_id: { type: Sequelize.UUID, allowNull: false },
    name: { type: Sequelize.STRING, allowNull: false },
    subject: { type: Sequelize.STRING },
    body_html: { type: Sequelize.TEXT },
    body_text: { type: Sequelize.TEXT },
    variables: { type: Sequelize.JSONB },
    is_default: { type: Sequelize.BOOLEAN, defaultValue: false },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var EmailTrackingEvents = sequelize.define('email_tracking_events', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    campaign_recipient_id: { type: Sequelize.UUID, allowNull: false },
    campaign_id: { type: Sequelize.UUID, allowNull: false },
    recipient_id: { type: Sequelize.UUID, allowNull: false },
    event_type: { type: Sequelize.STRING, allowNull: false },
    event_data: { type: Sequelize.JSONB },
    ip_address: { type: Sequelize.STRING },
    user_agent: { type: Sequelize.TEXT },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var FollowUpSequences = sequelize.define('follow_up_sequences', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    campaign_id: { type: Sequelize.UUID, allowNull: false },
    name: { type: Sequelize.STRING, allowNull: false },
    trigger_type: { type: Sequelize.STRING },
    trigger_delay_hours: { type: Sequelize.INTEGER },
    email_template_id: { type: Sequelize.UUID },
    is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var LinkedInCredentials = sequelize.define('linkedin_credentials', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    user_id: { type: Sequelize.UUID, unique: true, allowNull: false },
    email: { type: Sequelize.STRING, allowNull: false },
    password_encrypted: { type: Sequelize.TEXT, allowNull: false },
    session_data: { type: Sequelize.JSONB },
    is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
    last_used_at: { type: Sequelize.DATE },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var EmailSMTPCredentials = sequelize.define('email_smtp_credentials', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    user_id: { type: Sequelize.UUID, allowNull: false },
    provider: { type: Sequelize.STRING, allowNull: false },
    email: { type: Sequelize.STRING, allowNull: false },
    smtp_host: { type: Sequelize.STRING, allowNull: false },
    smtp_port: { type: Sequelize.INTEGER, allowNull: false },
    smtp_secure: { type: Sequelize.BOOLEAN, defaultValue: false },
    username: { type: Sequelize.STRING, allowNull: false },
    password_encrypted: { type: Sequelize.TEXT, allowNull: false },
    display_name: { type: Sequelize.STRING },
    is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
    is_verified: { type: Sequelize.BOOLEAN, defaultValue: false },
    last_used_at: { type: Sequelize.DATE },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var EmailCampaigns = sequelize.define('email_campaigns', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    user_id: { type: Sequelize.UUID, allowNull: false },
    name: { type: Sequelize.STRING, allowNull: false },
    description: { type: Sequelize.TEXT },
    template_id: { type: Sequelize.UUID },
    smtp_credential_id: { type: Sequelize.UUID, allowNull: false },
    subject: { type: Sequelize.STRING, allowNull: false },
    body_html: { type: Sequelize.TEXT, allowNull: false },
    body_text: { type: Sequelize.TEXT },
    status: { type: Sequelize.STRING, defaultValue: 'draft' },
    scheduled_at: { type: Sequelize.DATE },
    started_at: { type: Sequelize.DATE },
    completed_at: { type: Sequelize.DATE },
    total_recipients: { type: Sequelize.INTEGER, defaultValue: 0 },
    sent_count: { type: Sequelize.INTEGER, defaultValue: 0 },
    delivered_count: { type: Sequelize.INTEGER, defaultValue: 0 },
    opened_count: { type: Sequelize.INTEGER, defaultValue: 0 },
    clicked_count: { type: Sequelize.INTEGER, defaultValue: 0 },
    bounced_count: { type: Sequelize.INTEGER, defaultValue: 0 },
    replied_count: { type: Sequelize.INTEGER, defaultValue: 0 },
    unsubscribed_count: { type: Sequelize.INTEGER, defaultValue: 0 },
    settings: { type: Sequelize.JSONB },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var EmailTrackingPixels = sequelize.define('email_tracking_pixels', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    recipient_id: { type: Sequelize.UUID, allowNull: false },
    campaign_id: { type: Sequelize.UUID, allowNull: true },
    pixel_url: { type: Sequelize.STRING, unique: true, allowNull: false },
    is_opened: { type: Sequelize.BOOLEAN, defaultValue: false },
    opened_at: { type: Sequelize.DATE },
    opened_count: { type: Sequelize.INTEGER, defaultValue: 0 },
    ip_address: { type: Sequelize.STRING },
    user_agent: { type: Sequelize.TEXT },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var EmailLinkTracking = sequelize.define('email_link_tracking', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    recipient_id: { type: Sequelize.UUID, allowNull: false },
    original_url: { type: Sequelize.TEXT, allowNull: false },
    tracked_url: { type: Sequelize.STRING, unique: true, allowNull: false },
    click_count: { type: Sequelize.INTEGER, defaultValue: 0 },
    first_clicked_at: { type: Sequelize.DATE },
    last_clicked_at: { type: Sequelize.DATE },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var EmailBounces = sequelize.define('email_bounces', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    recipient_id: { type: Sequelize.UUID, allowNull: false },
    email: { type: Sequelize.STRING, allowNull: false },
    bounce_type: { type: Sequelize.STRING, allowNull: false },
    bounce_reason: { type: Sequelize.TEXT },
    bounce_code: { type: Sequelize.STRING },
    bounced_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var EmailReplies = sequelize.define('email_replies', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    recipient_id: { type: Sequelize.UUID, allowNull: false },
    campaign_id: { type: Sequelize.UUID, allowNull: false },
    from_email: { type: Sequelize.STRING, allowNull: false },
    subject: { type: Sequelize.STRING },
    body_text: { type: Sequelize.TEXT },
    body_html: { type: Sequelize.TEXT },
    replied_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var EmailUnsubscribes = sequelize.define('email_unsubscribes', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    user_id: { type: Sequelize.UUID, allowNull: false },
    email: { type: Sequelize.STRING, allowNull: false },
    campaign_id: { type: Sequelize.UUID },
    reason: { type: Sequelize.TEXT },
    unsubscribed_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

// Ticket System Models
var Tickets = sequelize.define('tickets', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    user_id: { type: Sequelize.UUID, allowNull: false },
    ticket_number: { type: Sequelize.STRING, unique: true, allowNull: false },
    subject: { type: Sequelize.STRING, allowNull: false },
    description: { type: Sequelize.TEXT, allowNull: false },
    category: {
        type: Sequelize.ENUM('technical', 'billing', 'feature_request', 'bug_report', 'account', 'other'),
        defaultValue: 'other',
        allowNull: false
    },
    priority: {
        type: Sequelize.ENUM('low', 'medium', 'high', 'urgent'),
        defaultValue: 'medium',
        allowNull: false
    },
    status: {
        type: Sequelize.ENUM('open', 'in_progress', 'waiting_customer', 'resolved', 'closed'),
        defaultValue: 'open',
        allowNull: false
    },
    assigned_to: { type: Sequelize.UUID, allowNull: true }, // Admin user ID
    resolved_at: { type: Sequelize.DATE, allowNull: true },
    closed_at: { type: Sequelize.DATE, allowNull: true },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var TicketComments = sequelize.define('ticket_comments', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    ticket_id: { type: Sequelize.UUID, allowNull: false },
    user_id: { type: Sequelize.UUID, allowNull: true }, // Can be null for system comments
    comment: { type: Sequelize.TEXT, allowNull: false },
    is_internal: { type: Sequelize.BOOLEAN, defaultValue: false }, // Internal notes visible only to admins
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

var TicketAttachments = sequelize.define('ticket_attachments', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    ticket_id: { type: Sequelize.UUID, allowNull: false },
    comment_id: { type: Sequelize.UUID, allowNull: true }, // Optional: attach to specific comment
    user_id: { type: Sequelize.UUID, allowNull: false },
    file_name: { type: Sequelize.STRING, allowNull: false },
    file_path: { type: Sequelize.STRING, allowNull: false },
    file_size: { type: Sequelize.INTEGER, allowNull: false }, // in bytes
    file_type: { type: Sequelize.STRING, allowNull: false }, // MIME type
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

// ============================================
// Define Associations (Foreign Keys & Relationships)
// ============================================

// Users Associations
Users.hasMany(BusinessRequirements, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Users.hasMany(Campaigns, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Users.hasMany(EmailTemplates, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Users.hasOne(LinkedInCredentials, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Users.hasMany(EmailSMTPCredentials, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Users.hasMany(EmailCampaigns, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Users.hasMany(EmailUnsubscribes, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Users.hasMany(Tickets, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Users.hasMany(TicketComments, { foreignKey: 'user_id', onDelete: 'SET NULL' });
Users.hasMany(TicketAttachments, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Users.hasMany(Tickets, { foreignKey: 'assigned_to', as: 'assignedTickets' });
// Self-referencing association for user approvals
Users.belongsTo(Users, { foreignKey: 'approved_by', as: 'approvedByUser', allowNull: true });

BusinessRequirements.belongsTo(Users, { foreignKey: 'user_id' });
Campaigns.belongsTo(Users, { foreignKey: 'user_id' });
EmailTemplates.belongsTo(Users, { foreignKey: 'user_id' });
LinkedInCredentials.belongsTo(Users, { foreignKey: 'user_id' });
EmailSMTPCredentials.belongsTo(Users, { foreignKey: 'user_id' });
EmailCampaigns.belongsTo(Users, { foreignKey: 'user_id' });
EmailUnsubscribes.belongsTo(Users, { foreignKey: 'user_id' });
Tickets.belongsTo(Users, { foreignKey: 'user_id', as: 'creator' });
Tickets.belongsTo(Users, { foreignKey: 'assigned_to', as: 'assignee' });
TicketComments.belongsTo(Users, { foreignKey: 'user_id' });
TicketComments.belongsTo(Tickets, { foreignKey: 'ticket_id', onDelete: 'CASCADE' });
TicketAttachments.belongsTo(Tickets, { foreignKey: 'ticket_id', onDelete: 'CASCADE' });
TicketAttachments.belongsTo(TicketComments, { foreignKey: 'comment_id', onDelete: 'CASCADE' });
TicketAttachments.belongsTo(Users, { foreignKey: 'user_id' });

// Business Requirements Associations
BusinessRequirements.hasMany(DecisionMakerRoles, { foreignKey: 'business_requirement_id', onDelete: 'CASCADE' });
BusinessRequirements.hasMany(LinkedInProfiles, { foreignKey: 'business_requirement_id', onDelete: 'CASCADE' });

DecisionMakerRoles.belongsTo(BusinessRequirements, { foreignKey: 'business_requirement_id' });
LinkedInProfiles.belongsTo(BusinessRequirements, { foreignKey: 'business_requirement_id' });

// LinkedIn Profiles Associations
LinkedInProfiles.hasMany(EmailAddresses, { foreignKey: 'linkedin_profile_id', onDelete: 'CASCADE' });
LinkedInProfiles.hasMany(CampaignRecipients, { foreignKey: 'linkedin_profile_id', onDelete: 'CASCADE' });
LinkedInProfiles.hasMany(CampaignRecipients, { foreignKey: 'lead_id', onDelete: 'CASCADE' });

EmailAddresses.belongsTo(LinkedInProfiles, { foreignKey: 'linkedin_profile_id' });

// Campaigns Associations
Campaigns.hasMany(CampaignRecipients, { foreignKey: 'campaign_id', onDelete: 'CASCADE' });
Campaigns.hasMany(FollowUpSequences, { foreignKey: 'campaign_id', onDelete: 'CASCADE' });
Campaigns.hasOne(EmailCampaigns, { foreignKey: 'id', sourceKey: 'id', as: 'email_campaign' });

CampaignRecipients.belongsTo(Campaigns, { foreignKey: 'campaign_id' });
FollowUpSequences.belongsTo(Campaigns, { foreignKey: 'campaign_id' });
EmailCampaigns.belongsTo(Campaigns, { foreignKey: 'id', targetKey: 'id' });

// Email Addresses Associations
EmailAddresses.hasMany(CampaignRecipients, { foreignKey: 'email_address_id', onDelete: 'CASCADE' });

CampaignRecipients.belongsTo(EmailAddresses, { foreignKey: 'email_address_id' });
CampaignRecipients.belongsTo(LinkedInProfiles, { foreignKey: 'linkedin_profile_id' });
CampaignRecipients.belongsTo(LinkedInProfiles, { foreignKey: 'lead_id' });

// Email Templates Associations
EmailTemplates.hasMany(FollowUpSequences, { foreignKey: 'email_template_id', onDelete: 'SET NULL' });
EmailTemplates.hasMany(EmailCampaigns, { foreignKey: 'template_id', onDelete: 'SET NULL' });

FollowUpSequences.belongsTo(EmailTemplates, { foreignKey: 'email_template_id' });
EmailCampaigns.belongsTo(EmailTemplates, { foreignKey: 'template_id' });

// Email SMTP Credentials Associations
EmailSMTPCredentials.hasMany(EmailCampaigns, { foreignKey: 'smtp_credential_id', onDelete: 'RESTRICT' });

EmailCampaigns.belongsTo(EmailSMTPCredentials, { foreignKey: 'smtp_credential_id' });

// Email Campaigns Associations
EmailCampaigns.hasMany(CampaignRecipients, { foreignKey: 'campaign_id', onDelete: 'CASCADE' });
EmailCampaigns.hasMany(EmailTrackingEvents, { foreignKey: 'campaign_id', onDelete: 'CASCADE' });
EmailCampaigns.hasMany(EmailReplies, { foreignKey: 'campaign_id', onDelete: 'CASCADE' });
EmailCampaigns.hasMany(EmailUnsubscribes, { foreignKey: 'campaign_id', onDelete: 'SET NULL' });

CampaignRecipients.belongsTo(EmailCampaigns, { foreignKey: 'campaign_id' });
EmailTrackingEvents.belongsTo(EmailCampaigns, { foreignKey: 'campaign_id' });
EmailReplies.belongsTo(EmailCampaigns, { foreignKey: 'campaign_id' });
EmailUnsubscribes.belongsTo(EmailCampaigns, { foreignKey: 'campaign_id' });

// Campaign Recipients Associations
CampaignRecipients.hasMany(EmailTrackingEvents, { foreignKey: 'campaign_recipient_id', onDelete: 'CASCADE' });
CampaignRecipients.hasMany(EmailTrackingEvents, { foreignKey: 'recipient_id', onDelete: 'CASCADE' });
CampaignRecipients.hasMany(EmailTrackingPixels, { foreignKey: 'recipient_id', onDelete: 'CASCADE' });
CampaignRecipients.hasMany(EmailLinkTracking, { foreignKey: 'recipient_id', onDelete: 'CASCADE' });
CampaignRecipients.hasMany(EmailBounces, { foreignKey: 'recipient_id', onDelete: 'CASCADE' });
CampaignRecipients.hasMany(EmailReplies, { foreignKey: 'recipient_id', onDelete: 'CASCADE' });

EmailTrackingEvents.belongsTo(CampaignRecipients, { foreignKey: 'campaign_recipient_id' });
EmailTrackingEvents.belongsTo(CampaignRecipients, { foreignKey: 'recipient_id' });
EmailTrackingPixels.belongsTo(CampaignRecipients, { foreignKey: 'recipient_id' });
EmailLinkTracking.belongsTo(CampaignRecipients, { foreignKey: 'recipient_id' });
EmailBounces.belongsTo(CampaignRecipients, { foreignKey: 'recipient_id' });
EmailReplies.belongsTo(CampaignRecipients, { foreignKey: 'recipient_id' });

// Ticket System Associations
Tickets.hasMany(TicketComments, { foreignKey: 'ticket_id', as: 'comments', onDelete: 'CASCADE' });
Tickets.hasMany(TicketAttachments, { foreignKey: 'ticket_id', as: 'attachments', onDelete: 'CASCADE' });
TicketComments.hasMany(TicketAttachments, { foreignKey: 'comment_id', as: 'attachments', onDelete: 'CASCADE' });

// System Settings Model
var SystemSettings = sequelize.define('system_settings', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV1, primaryKey: true },
    key: { type: Sequelize.STRING, unique: true, allowNull: false },
    value: { type: Sequelize.TEXT, allowNull: false },
    description: { type: Sequelize.TEXT },
    updated_by: { type: Sequelize.UUID, allowNull: true },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
});

// System Settings Associations
SystemSettings.belongsTo(Users, { foreignKey: 'updated_by', as: 'updatedByUser' });

// ============================================
// Note: Indexes are NOT automatically created by Sequelize sync()
// All indexes are defined in: database/indexes.sql
// 
// To create indexes manually, run:
// psql -U postgres -d lead_stitch -f database/indexes.sql
// OR execute the indexes.sql file in your database client
//
// To add new indexes:
// 1. Add them to database/indexes.sql
// 2. Run the file manually in your database
// ============================================

module.exports = {
    "PsqlSequelize": sequelize,
    "Users": Users,
    "BusinessRequirements": BusinessRequirements,
    "DecisionMakerRoles": DecisionMakerRoles,
    "LinkedInProfiles": LinkedInProfiles,
    "EmailAddresses": EmailAddresses,
    "Campaigns": Campaigns,
    "CampaignRecipients": CampaignRecipients,
    "EmailTemplates": EmailTemplates,
    "EmailTrackingEvents": EmailTrackingEvents,
    "FollowUpSequences": FollowUpSequences,
    "LinkedInCredentials": LinkedInCredentials,
    "EmailSMTPCredentials": EmailSMTPCredentials,
    "EmailCampaigns": EmailCampaigns,
    "EmailTrackingPixels": EmailTrackingPixels,
    "EmailLinkTracking": EmailLinkTracking,
    "EmailBounces": EmailBounces,
    "EmailReplies": EmailReplies,
    "EmailUnsubscribes": EmailUnsubscribes,
    "Tickets": Tickets,
    "TicketComments": TicketComments,
    "TicketAttachments": TicketAttachments,
    "SystemSettings": SystemSettings
};

