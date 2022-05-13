
import fetch from 'node-fetch';

export const sendWebhook = async (content: string, webhookUrl: string) => {
    const webhookBody = {
        CONTENT: content
    };
    const response = await fetch(webhookUrl, {
        method: 'post',
        body: JSON.stringify(webhookBody),
        headers: { 'Content-Type': 'text/plain' }
    });
    return response;
}