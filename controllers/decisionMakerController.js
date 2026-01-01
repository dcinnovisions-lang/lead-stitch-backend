const { BusinessRequirements, DecisionMakerRoles } = require('../config/model');
const { Op } = require('sequelize');

// Helper function to convert priority string to integer
function convertPriorityToInt(priority) {
    if (typeof priority === 'number') {
        return priority;
    }
    if (typeof priority === 'string') {
        const priorityLower = priority.toLowerCase();
        if (priorityLower === 'high') return 3;
        if (priorityLower === 'medium') return 2;
        if (priorityLower === 'low') return 1;
    }
    // Default to medium if invalid
    return 2;
}

// Get all decision makers for a requirement
exports.getDecisionMakers = async (req, res) => {
    try {
        const { requirementId } = req.params;
        const userId = req.user.userId;

        // Verify requirement belongs to user
        const requirement = await BusinessRequirements.findOne({
            where: {
                id: requirementId,
                user_id: userId
            }
        });

        if (!requirement) {
            return res.status(404).json({ message: 'Business requirement not found' });
        }

        // Get decision makers
        const decisionMakers = await DecisionMakerRoles.findAll({
            where: { business_requirement_id: requirementId },
            order: [['priority', 'DESC'], ['created_at', 'ASC']]
        });

        res.json(decisionMakers);
    } catch (error) {
        console.error('Get decision makers error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Create a new decision maker
exports.createDecisionMaker = async (req, res) => {
    try {
        const { requirementId, roleTitle, industry, priority } = req.body;
        const userId = req.user.userId;

        if (!requirementId || !roleTitle) {
            return res.status(400).json({ message: 'Requirement ID and role title are required' });
        }

        // Verify requirement belongs to user
        const requirement = await BusinessRequirements.findOne({
            where: {
                id: requirementId,
                user_id: userId
            }
        });

        if (!requirement) {
            return res.status(404).json({ message: 'Business requirement not found' });
        }

        // Get max priority if not provided
        let finalPriority = priority;
        if (!finalPriority) {
            const { PsqlSequelize } = require('../config/model');
            const maxPriorityResult = await DecisionMakerRoles.findOne({
                where: { business_requirement_id: requirementId },
                attributes: [[PsqlSequelize.fn('MAX', PsqlSequelize.col('priority')), 'max_priority']],
                raw: true
            });
            finalPriority = (maxPriorityResult?.max_priority || 0) + 1;
        } else {
            // Convert priority string to integer if needed
            finalPriority = convertPriorityToInt(finalPriority);
        }

        // Use industry from request or fall back to requirement's industry
        const finalIndustry = industry || requirement.industry;

        // Create decision maker
        const decisionMaker = await DecisionMakerRoles.create({
            business_requirement_id: requirementId,
            role_title: roleTitle,
            industry: finalIndustry,
            priority: finalPriority,
            api_source: 'manual'
        });

        res.status(201).json(decisionMaker);
    } catch (error) {
        console.error('Create decision maker error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Update a decision maker
exports.updateDecisionMaker = async (req, res) => {
    try {
        const { id } = req.params;
        const { roleTitle, industry, priority } = req.body;
        const userId = req.user.userId;

        if (!roleTitle) {
            return res.status(400).json({ message: 'Role title is required' });
        }

        // Verify decision maker belongs to user's requirement
        const decisionMaker = await DecisionMakerRoles.findOne({
            include: [{
                model: BusinessRequirements,
                where: { user_id: userId },
                attributes: []
            }],
            where: { id: id }
        });

        if (!decisionMaker) {
            return res.status(404).json({ message: 'Decision maker not found' });
        }

        // Update decision maker
        const updateData = {};
        if (roleTitle) {
            updateData.role_title = roleTitle;
        }
        if (industry !== undefined) {
            updateData.industry = industry;
        }
        if (priority !== undefined) {
            // Convert priority string to integer if needed
            updateData.priority = convertPriorityToInt(priority);
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        updateData.updated_at = new Date();
        await decisionMaker.update(updateData);

        res.json(decisionMaker);
    } catch (error) {
        console.error('Update decision maker error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Delete a decision maker
exports.deleteDecisionMaker = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        // Verify decision maker belongs to user's requirement
        const decisionMaker = await DecisionMakerRoles.findOne({
            include: [{
                model: BusinessRequirements,
                where: { user_id: userId },
                attributes: []
            }],
            where: { id: id }
        });

        if (!decisionMaker) {
            return res.status(404).json({ message: 'Decision maker not found' });
        }

        // Delete decision maker
        await decisionMaker.destroy();

        res.json({ message: 'Decision maker deleted successfully' });
    } catch (error) {
        console.error('Delete decision maker error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Finalize decision makers and mark requirement as ready for scraping
exports.finalizeDecisionMakers = async (req, res) => {
    try {
        const { requirementId } = req.params;
        const userId = req.user.userId;

        // Verify requirement belongs to user
        const requirement = await BusinessRequirements.findOne({
            where: {
                id: requirementId,
                user_id: userId
            }
        });

        if (!requirement) {
            return res.status(404).json({ message: 'Business requirement not found' });
        }

        // Get decision makers
        const decisionMakers = await DecisionMakerRoles.findAll({
            where: { business_requirement_id: requirementId }
        });

        if (decisionMakers.length === 0) {
            return res.status(400).json({ message: 'No decision makers to finalize' });
        }

        // Update requirement to mark decision makers as finalized
        await BusinessRequirements.update(
            { 
                decision_makers_finalized_at: new Date(),
                status: 'ready_for_scraping'
            },
            { where: { id: requirementId } }
        );

        res.json({
            message: 'Decision makers finalized successfully',
            decisionMakers: decisionMakers,
            requirementId: requirementId,
            readyForScraping: true,
        });
    } catch (error) {
        console.error('Finalize decision makers error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

