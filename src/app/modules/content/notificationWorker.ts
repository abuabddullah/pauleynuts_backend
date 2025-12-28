import { Worker, Job } from 'bullmq';
import { sendNotifications } from '../../../helpers/notificationsHelper';
import { Campaign } from '../campaign/campaign.model';
import { Content } from './content.model';
import { scheduleQueue } from '../../../utils/scheduleQueue';
import redisConnection from '../../../config/redis';


export const startNotificationWorker = () => {
    const worker = new Worker(
        'scheduleQueue',
        async (job: Job) => {
            console.log(`📬 Processing: ${job.name}`);

            try {
                switch (job.name) {
                    case 'sendProgressAlert':
                        await handleProgressAlert(job.data);
                        break;

                    case 'checkLowProgress':
                        await handleLowProgressWarning();
                        break;

                    case 'checkExpiredCampaigns':
                        await handleExpiredCampaigns();
                        break;

                    case 'sendMilestoneAlert':
                        await handleMilestoneAlert(job.data);
                        break;

                    default:
                        console.log(`❓ Unknown job: ${job.name}`);
                }
            } catch (error) {
                console.error(`❌ Job ${job.name} failed:`, error);
                throw error; // Re-throw for retry
            }
        },
        {
            connection: redisConnection,
            concurrency: 5,
        }
    );

    worker.on('completed', (job) => {
        console.log(`✅ Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
        console.error(`❌ Job ${job?.id} failed:`, err.message);
    });

    console.log('🔄 Notification worker started');
    return worker;
};

// ============ Handlers ============

async function handleProgressAlert(data: any) {
    const { message, campingId, organizationId } = data;

    // Build query based on what's selected
    const query: any = {
        status: 'active',
        endDate: { $gt: new Date() }
    };

    // If specific campaign selected
    if (campingId) {
        query._id = campingId;
    }

    // If specific organizations selected
    if (organizationId && organizationId.length > 0) {
        query.createdBy = { $in: organizationId };
    }

    const campaigns = await Campaign.find(query).populate('createdBy');

    for (const campaign of campaigns) {
        const progress = (campaign?.currentAmount / campaign?.goalAmount) * 100;

        await sendNotifications({
            userId: campaign.createdBy._id,
            type: 'PROGRESS_ALERT',
            title: 'Campaign Progress Update',
            message: message.replace('{progress}', progress.toFixed(1)),
            data: { campaignId: campaign._id }
        });
    }

    console.log(`📊 Sent ${campaigns.length} progress alerts`);
}

async function handleLowProgressWarning() {
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);

    const campaigns = await Campaign.find({
        status: 'active',
        endDate: {
            $gte: new Date(),
            $lte: oneWeekFromNow
        }
    }).populate('createdBy');

    let warningCount = 0;
    for (const campaign of campaigns) {
        const progress = (campaign.currentAmount / campaign.goalAmount) * 100;

        if (progress < 25) {
            await sendNotifications({
                userId: campaign.createdBy._id,
                type: 'LOW_PROGRESS_WARNING',
                title: '⚠️ Low Campaign Progress',
                message: `"${campaign.title}" is below 25% with 1 week left`,
                data: { campaignId: campaign._id, progress }
            });
            warningCount++;
        }
    }

    console.log(`⚠️ Sent ${warningCount} low progress warnings`);
}

async function handleExpiredCampaigns() {
    const campaigns = await Campaign.find({
        status: 'active',
        endDate: { $lt: new Date() }
    }).populate('createdBy');

    for (const campaign of campaigns) {
        await Campaign.findByIdAndUpdate(campaign._id, { status: 'expired' });

        await sendNotifications({
            userId: campaign.createdBy._id,
            type: 'CAMPAIGN_EXPIRED',
            title: '⏰ Campaign Expired',
            message: `"${campaign.title}" has ended`,
            data: { campaignId: campaign._id }
        });
    }

    console.log(`⏰ ${campaigns.length} campaigns expired`);
}

// Milestone trigger (call from donation handler)
export async function triggerMilestoneAlert(
    campaignId: string,
    milestone: number
) {
    await scheduleQueue.add('sendMilestoneAlert', {
        campaignId,
        milestone
    });
}

async function handleMilestoneAlert(data: any) {
    const { campaignId, milestone } = data;
    const content = await Content.findOne();

    const campaign = await Campaign.findById(campaignId).populate('createdBy');
    if (!campaign) return;

    await sendNotifications({
        userId: campaign.createdBy._id,
        type: 'MILESTONE_ALERT',
        title: '🎉 Milestone Reached!',
        message: content?.notificationStrategy.mileStoneAlertMessage
            .replace('{milestone}', milestone.toString()) ||
            `Congratulations! ${milestone}% achieved!`,
        data: { campaignId, milestone }
    });

    console.log(`🎉 Milestone ${milestone}% for ${campaignId}`);
}