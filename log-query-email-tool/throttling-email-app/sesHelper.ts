import SES from "aws-sdk/clients/ses";

export const sendSNSEmail = async (email: string[], content: string, subject: string, ses: SES): Promise<void> => {
        await ses.sendEmail({
            Destination: {
                ToAddresses: email
            },
            Message: {
                Body: {
                    Html: {
                        Charset: "UTF-8",
                        Data: content
                    }
                },
                Subject: {
                    Charset: 'UTF-8',
                    Data: subject
                }
            },
            Source: process.env.FROM_EMAIL!
        }).promise();
}