import { StatusCodes } from 'http-status-codes';
import AppError from '../../../errors/AppError';
import { Campaign } from './campaign.model';
import QueryBuilder from '../../builder/QueryBuilder';
import unlinkFile from '../../../shared/unlinkFile';
import { ICampaign } from './campaign.interface';
import { User } from '../user/user.model';
import { IInvitationHistory } from '../InvitationHistory/InvitationHistory.interface';
import { InvitationType } from '../InvitationHistory/InvitationHistory.enum';
import { InvitationHistory } from '../InvitationHistory/InvitationHistory.model';
import sendSMS from '../../../shared/sendSMS';
import { paymentStatusType } from '../Transaction/Transaction.interface';
import { Transaction } from '../Transaction/Transaction.model';
import mongoose from 'mongoose';
import { sendNotifications } from '../../../helpers/notificationsHelper';

const createCampaign = async (payload: ICampaign & { image?: string }): Promise<ICampaign> => {
     const createCampaignDto = {
          ...payload,
          cause_image: payload.image,
     };
     const result = await Campaign.create(createCampaignDto);
     if (!result) {
          if (payload.image) {
               unlinkFile(payload.image);
          }
          throw new AppError(StatusCodes.NOT_FOUND, 'Campaign not found.');
     }
     return result;
};

const getAllCampaigns = async (query: Record<string, any>): Promise<{ meta: { total: number; page: number; limit: number }; result: ICampaign[] }> => {
     const queryBuilder = new QueryBuilder(Campaign.find(), query);
     const result = await queryBuilder.search(['title', 'description', 'cause_title', 'organization_name']).filter().sort().paginate().fields().modelQuery;
     const meta = await queryBuilder.countTotal();
     return { meta, result };
};

const getAllUnpaginatedCampaigns = async (): Promise<ICampaign[]> => {
     const result = await Campaign.find();
     return result;
};

const updateCampaign = async (id: string, payload: Partial<ICampaign & { image?: string }>): Promise<ICampaign | null> => {
     const isExist = await Campaign.findById(id);
     if (!isExist) {
          if (payload.image) {
               unlinkFile(payload.image);
          }
          throw new AppError(StatusCodes.NOT_FOUND, 'Campaign not found.');
     }

     if (payload.image && isExist.cause_image) {
          unlinkFile(isExist.cause_image);
     }
     const updateCampaignDto = {
          ...payload,
          cause_image: payload.image,
     };
     return await Campaign.findByIdAndUpdate(id, updateCampaignDto, { new: true });
};

const deleteCampaign = async (id: string): Promise<ICampaign | null> => {
     const result = await Campaign.findById(id);
     if (!result) {
          throw new AppError(StatusCodes.NOT_FOUND, 'Campaign not found.');
     }
     result.isDeleted = true;
     result.deletedAt = new Date();
     await result.save();
     return result;
};

const hardDeleteCampaign = async (id: string): Promise<ICampaign | null> => {
     const result = await Campaign.findByIdAndDelete(id);
     if (!result) {
          throw new AppError(StatusCodes.NOT_FOUND, 'Campaign not found.');
     }
     if (result.cause_image) {
          unlinkFile(result.cause_image);
     }
     return result;
};

const getCampaignById = async (id: string): Promise<ICampaign | null> => {
     const result = await Campaign.findById(id);
     return result;
};

const invitePeopleToCampaign = async (
     payload: { myInvitees: { invitationForPhone: string; invitationForName?: string }[]; donationAmount?: number; paymentMethod?: string; invitationIrecievedFrom: string }, // totalRaised+
     user: any, // totalDonated+,totalInvited+
     campaignId: string,
) => {
     if (payload.invitationIrecievedFrom.toString() === user.id.toString()) {
          throw new AppError(StatusCodes.BAD_REQUEST, 'You can not invite yourself.');
     }
     const campaign = await Campaign.findById(campaignId);
     if (!campaign) {
          throw new AppError(StatusCodes.NOT_FOUND, 'Campaign not found.');
     }
     // Check Double User
     const isExitUser = await User.findById(user.id)

     if (!isExitUser || !isExitUser.contact) {
          throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
     }
     const isInvitationUser = await User.findById({ _id: payload.invitationIrecievedFrom });
     if (!isInvitationUser) {
          throw new AppError(StatusCodes.NOT_FOUND, 'Invitation User not found.');
     }

     const batchInvitationDto = [];
     // Populate batchInvitationDto with data from payload
     for (const invitee of payload.myInvitees) {
          batchInvitationDto.push({
               type: InvitationType.invitation,
               campaignId: campaign._id,
               invitationFromUser: isExitUser._id,
               invitationFromPhone: isExitUser.contact || '',
               invitationForPhone: invitee.invitationForPhone,
               invitationForName: invitee.invitationForName || '',
               isDonated: payload.donationAmount && payload.donationAmount > 0,
          });

          if (invitee.invitationForPhone) {
               await sendSMS(invitee.invitationForPhone, `You've been invited to join campaign "${campaign.title}". Join now!`);
          }
     }



     const session = await mongoose.startSession();
     session.startTransaction();

     try {
          // Create invitation records (bulk insert)
          await InvitationHistory.insertMany(batchInvitationDto, { session });

          if (payload.donationAmount && payload.donationAmount > 0) {
               const donationDto = {
                    donorId: isExitUser._id,
                    donorPhone: isExitUser.contact || '',
                    paymentMethod: payload.paymentMethod,
                    transactionId: `INV-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                    amountPaid: payload.donationAmount,
                    campaignId: campaign._id,
                    paymentStatus: paymentStatusType.COMPLETED,
               };

               // Create a donation record
               const createdDonation = await Transaction.create([donationDto], { session });
               if (!createdDonation) {
                    throw new AppError(StatusCodes.BAD_REQUEST, 'Failed to create donation record');
               }

               console.log(payload.myInvitees.length)
               console.log(payload.donationAmount)
               await User.updateOne({ _id: isInvitationUser._id }, { $inc: { totalRaised: payload.donationAmount || 0 } }, { session });

               await User.updateOne({ _id: isExitUser._id }, { $inc: { totalDonated: payload.donationAmount || 0, totalInvited: payload.myInvitees.length } }, { session });
          }

          // Commit the transaction if everything is successful
          await session.commitTransaction();
          session.endSession();

          // // notify to admin ⏰
          // await sendNotifications()

          return {
               message: 'People invited successfully',
               donationAmount: payload.donationAmount && payload.donationAmount > 0 ? payload.donationAmount : undefined,
          };
     } catch (error) {
          console.log('🚀 ~ invitePeopleToCampaign ~ error:', error);

          // Abort the transaction if an error occurs
          await session.abortTransaction();
          session.endSession();

          // Re-throw the error so it can be handled by the calling function
          throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, 'Failed to process invitation and donation');
     }
};

export const campaignService = {
     createCampaign,
     getAllCampaigns,
     getAllUnpaginatedCampaigns,
     updateCampaign,
     deleteCampaign,
     hardDeleteCampaign,
     getCampaignById,
     invitePeopleToCampaign,
};
