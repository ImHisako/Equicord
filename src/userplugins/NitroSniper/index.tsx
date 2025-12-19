/*
Made with ❤️ by neoarz
I am not responsible for any damage caused by this plugin; use at your own risk
Vencord does not endorse/support this plugin (Works with Equicord as well)
dm @neoarz if u need help or have any questions
https://github.com/neoarz/NitroSniper
*/

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";

const logger = new Logger("NitroSniper");
const GiftActions = findByPropsLazy("redeemGiftCode");

let startTime = 0;
let claiming = false;
const codeQueue: string[] = [];

const settings = definePluginSettings({
    webhookEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable webhook notifications for Nitro code detection",
        default: false
    },
    webhookURL: {
        type: OptionType.STRING,
        description: "Webhook URL to send notifications to",
        default: ""
    },
    webhookUsername: {
        type: OptionType.STRING,
        description: "Webhook username",
        default: "Nitro Sniper"
    },
    webhookAvatar: {
        type: OptionType.STRING,
        description: "Webhook avatar URL",
        default: ""
    },
    notifyOnSuccess: {
        type: OptionType.BOOLEAN,
        description: "Send webhook notification for successful redemptions",
        default: true
    },
    notifyOnFailure: {
        type: OptionType.BOOLEAN,
        description: "Send webhook notification for failed redemptions",
        default: true
    },
    includeMessageInfo: {
        type: OptionType.BOOLEAN,
        description: "Include message information in webhook notifications",
        default: true
    }
});

function sendWebhookNotification(code: string, success: boolean, errorMessage?: string, messageInfo?: { author: string; channel: string; guild?: string; }) {
    if (!settings.store.webhookEnabled || !settings.store.webhookURL) return;

    if ((success && !settings.store.notifyOnSuccess) || (!success && !settings.store.notifyOnFailure)) return;

    const embed: any = {
        title: success ? "Nitro Code Redeemed Successfully!" : "Nitro Code Redemption Failed",
        color: success ? 0x57F287 : 0xED4245,
        fields: [
            {
                name: "Code",
                value: `\`${code}\``,
                inline: true
            },
            {
                name: "Status",
                value: success ? "Success" : "Failed",
                inline: true
            }
        ],
        timestamp: new Date().toISOString()
    };

    if (!success && errorMessage) {
        embed.fields.push({
            name: "Error",
            value: errorMessage.substring(0, 1024), // Discord has a 1024 char limit for field values
            inline: false
        });
    }

    if (settings.store.includeMessageInfo && messageInfo) {
        embed.fields.push({
            name: "Author",
            value: messageInfo.author || "Unknown",
            inline: true
        });

        embed.fields.push({
            name: "Channel ID",
            value: messageInfo.channel || "Unknown",
            inline: true
        });

        if (messageInfo.guild) {
            embed.fields.push({
                name: "Guild ID",
                value: messageInfo.guild,
                inline: true
            });
        }
    }

    const payload: any = {
        embeds: [embed]
    };

    // Only add username/avatar if they are not empty
    if (settings.store.webhookUsername && settings.store.webhookUsername.trim() !== "") {
        payload.username = settings.store.webhookUsername.trim();
    }

    if (settings.store.webhookAvatar && settings.store.webhookAvatar.trim() !== "") {
        payload.avatar_url = settings.store.webhookAvatar.trim();
    }

    // Validate URL before sending
    try {
        new URL(settings.store.webhookURL);
    } catch (urlError) {
        logger.error("Invalid webhook URL:", settings.store.webhookURL);
        return;
    }

    fetch(settings.store.webhookURL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    }).then(response => {
        if (!response.ok) {
            logger.error(`Webhook request failed with status ${response.status}: ${response.statusText}`);
            return response.text().then(text => {
                logger.error(`Webhook response body: ${text}`);
            });
        }
    }).catch(err => {
        logger.error("Failed to send webhook notification:", err);
    });
}

function processQueue(messageInfo?: { author: string; channel: string; guild?: string; }) {
    if (claiming || !codeQueue.length) return;

    claiming = true;
    const code = codeQueue.shift()!;

    GiftActions.redeemGiftCode({
        code,
        onRedeemed: () => {
            logger.log(`Successfully redeemed code: ${code}`);
            if (settings.store.webhookEnabled) {
                sendWebhookNotification(code, true, undefined, messageInfo);
            }
            claiming = false;
            processQueue(messageInfo);
        },
        onError: (err: Error) => {
            logger.error(`Failed to redeem code: ${code}`, err);
            if (settings.store.webhookEnabled) {
                sendWebhookNotification(code, false, err.message, messageInfo);
            }
            claiming = false;
            processQueue(messageInfo);
        }
    });
}

export default definePlugin({
    name: "NitroSniper",
    description: "Automatically redeems Nitro gift links sent in chat with webhook notifications",
    authors: [Devs.neoarz],
    settings,

    start() {
        startTime = Date.now();
        codeQueue.length = 0;
        claiming = false;
    },

    flux: {
        MESSAGE_CREATE({ message }) {
            if (!message.content) return;

            const match = message.content.match(/(?:discord\.gift\/|discord\.com\/gifts?\/)([a-zA-Z0-9]{16,24})/);
            if (!match) return;

            if (new Date(message.timestamp).getTime() < startTime) return;

            const messageInfo = {
                author: message.author?.username || "Unknown",
                channel: message.channel_id || "Unknown",
                guild: message.guild_id || undefined
            };

            codeQueue.push(match[1]);
            processQueue(messageInfo);
        }
    }
});
