/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { Menu } from "@webpack/common";

const MediaEngineActions = findByPropsLazy("toggleSelfMute");
const NotificationSettingsStore = findByPropsLazy("getDisableAllSounds", "getState");

let updating = false;

async function update() {
    if (updating) return setTimeout(update, 125);
    updating = true;
    const state = NotificationSettingsStore.getState();
    const toDisable: string[] = [];
    if (!state.disabledSounds.includes("mute")) toDisable.push("mute");
    if (!state.disabledSounds.includes("unmute")) toDisable.push("unmute");

    state.disabledSounds.push(...toDisable);
    await new Promise(r => setTimeout(r, 50));
    await MediaEngineActions.toggleSelfMute();
    await new Promise(r => setTimeout(r, 100));
    await MediaEngineActions.toggleSelfMute();
    state.disabledSounds = state.disabledSounds.filter((i: string) => !toDisable.includes(i));
    updating = false;
}

export const settings = definePluginSettings({
    autoMute: {
        type: OptionType.BOOLEAN,
        description: "Automatically mute when deafened.",
        default: true
    }
});

const fakeVoiceState = {
    _selfMute: false,
    get selfMute() {
        try {
            if (!settings.store.autoMute) return this._selfMute;
            return this.selfDeaf || this._selfMute;
        } catch (e) {
            return this._selfMute;
        }
    },
    set selfMute(value) {
        this._selfMute = value;
    },
    selfDeaf: false,
    selfVideo: false,
    getState() {
        return {
            selfMute: this.selfMute,
            selfDeaf: this.selfDeaf,
            selfVideo: this.selfVideo
        };
    }
};

export default definePlugin({
    name: "FakeMuteAndDeafen",
    description: "You can fake mute and deafen yourself. You can continue speaking and being heard during this time.",
    authors: [Devs.feelslove],
    settings,

    modifyVoiceState(e) {
        // Forza SEMPRE i valori fake
        e.selfMute = fakeVoiceState.selfMute;
        e.selfDeaf = fakeVoiceState.selfDeaf;
        e.selfVideo = fakeVoiceState.selfVideo;
        return e;
    },

    start() {
        // Observer per preservare lo stato tra canali
        const VoiceStateStore = findByPropsLazy("getVoiceStateForUser");
        const originalGetState = VoiceStateStore?.getVoiceStateForUser;
        
        if (originalGetState) {
            VoiceStateStore.getVoiceStateForUser = (userId) => {
                const state = originalGetState(userId);
                if (state && userId === DiscordNative.userId) {
                    state.selfMute = fakeVoiceState.selfMute;
                    state.selfDeaf = fakeVoiceState.selfDeaf;
                    state.selfVideo = fakeVoiceState.selfVideo;
                }
                return state;
            };
        }
    },

    contextMenus: {
        "audio-device-context"(children, d) {
            if (d.renderInputDevices) {
                children.push(
                    <Menu.MenuSeparator />,
                    <Menu.MenuCheckboxItem
                        id="fake-mute"
                        label="Fake Mute"
                        checked={fakeVoiceState.selfMute}
                        action={() => {
                            fakeVoiceState.selfMute = !fakeVoiceState.selfMute;
                            update();
                        }}
                    />
                );
            }

            if (d.renderOutputDevices) {
                children.push(
                    <Menu.MenuSeparator />,
                    <Menu.MenuCheckboxItem
                        id="fake-deafen"
                        label="Fake Deafen"
                        checked={fakeVoiceState.selfDeaf}
                        action={() => {
                            fakeVoiceState.selfDeaf = !fakeVoiceState.selfDeaf;
                            update();
                        }}
                    />
                );
            }
        },
        "video-device-context"(children) {
            children.push(
                <Menu.MenuSeparator />,
                <Menu.MenuCheckboxItem
                    id="fake-video"
                    label="Fake Camera"
                    checked={fakeVoiceState.selfVideo}
                    action={() => {
                        fakeVoiceState.selfVideo = !fakeVoiceState.selfVideo;
                        update();
                    }}
                />
            );
        }
    },

    // ✅ PATCH SEMPLIFICATE E CORRETTE
    patches: [
        {
            // Patch principale voiceStateUpdate (ORIGINALE + SEMPLIFICATA)
            find: "voiceServerPing(){",
            replacement: {
                match: /voiceStateUpdate\(\w+\){(.{0,50})guildId:/,
                replace: "voiceStateUpdate($self.modifyVoiceState($1)){$1guildId:"
            }
        },
        {
            // Patch per il cambio canale
            find: '"VOICE_STATE_UPDATE"',
            replacement: {
                match: /(\w+)\.updateVoiceState\(/,
                replace: "$1.updateVoiceState($self.modifyVoiceState("
            }
        },
        {
            // Patch per setSelfMute
            find: "setSelfMute(",
            replacement: {
                match: /setSelfMute\([^)]+\)/,
                replace: "setSelfMute($&)&&$self.modifyVoiceState({selfMute:$self.fakeVoiceState.selfMute})"
            }
        }
    ]
});
