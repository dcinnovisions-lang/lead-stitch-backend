const axios = require('axios');

/**
 * Apollo.io Service for email enrichment
 * API Documentation: https://apolloio.github.io/apollo-api-docs/
 */
class ApolloService {
    constructor() {
        this.apiKey = process.env.APOLLO_API_KEY;
        this.baseURL = 'https://api.apollo.io/api/v1';
    }

    /**
     * Find email address for a person
     * @param {Object} personData - Person data (name, company, linkedin_url, etc.)
     * @returns {Promise<Object>} Email data
     */
    async findEmail(personData) {
        if (!this.apiKey) {
            throw new Error('Apollo.io API key not configured');
        }

        try {
            // Use people/match endpoint which is the recommended way to enrich by LinkedIn URL
            const matchPayload = {};
            if (personData.linkedin_url) matchPayload.linkedin_url = personData.linkedin_url;
            if (personData.firstName) matchPayload.first_name = personData.firstName;
            if (personData.lastName) matchPayload.last_name = personData.lastName;
            if (personData.company_name) {
                // Extract domain if company_name contains a domain
                const domain = personData.company_name.includes('.')
                    ? personData.company_name
                    : null;
                if (domain) matchPayload.domain = domain;
            }

            const response = await axios.post(
                `${this.baseURL}/people/match`,
                matchPayload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache',
                        'X-Api-Key': this.apiKey,
                    },
                }
            );

            if (response.data && response.data.person) {
                const person = response.data.person;
                const email = person.email || (person.emails && person.emails[0] && person.emails[0].address) || null;
                return {
                    email: email,
                    email_status: person.email_verification_status || person.email_status || 'unknown',
                    phone_numbers: person.phone_numbers || [],
                    verified: person.email_verification_status === 'verified' || person.email_status === 'verified',
                };
            }

            return { email: null, email_status: 'not_found', verified: false };
        } catch (error) {
            console.error('Apollo.io API error:', error.response?.data || error.message);
            throw new Error('Failed to find email via Apollo.io');
        }
    }

    /**
     * Enrich person data with email
     * @param {Object} personData - Person data
     * @returns {Promise<Object>} Enriched data
     */
    async enrichPerson(personData) {
        try {
            const emailData = await this.findEmail(personData);
            return {
                ...personData,
                email: emailData.email,
                email_status: emailData.email_status,
                email_verified: emailData.verified,
            };
        } catch (error) {
            console.error('Apollo enrichment error:', error);
            return {
                ...personData,
                email: null,
                email_status: 'error',
                email_verified: false,
            };
        }
    }
}

module.exports = new ApolloService();

