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
    selfVideo: false
};

const StateKeys = ["selfDeaf", "selfMute", "selfVideo"];

export default definePlugin({
    name: "FakeMuteAndDeafen",
    description: "You can fake mute and deafen yourself. You can continue speaking and being heard during this time.",
    authors: [Devs.feelslove],
    settings,

    // ✅ NUOVE FUNZIONI PER IL FIX
    saveFakeState(state) {
        // Preserva lo stato fake quando Discord resetta
        if (state.selfMute !== undefined) fakeVoiceState._selfMute = state.selfMute;
        if (state.selfDeaf !== undefined) fakeVoiceState.selfDeaf = state.selfDeaf;
        if (state.selfVideo !== undefined) fakeVoiceState.selfVideo = state.selfVideo;
    },

    applyFakeMute(deaf, realMute, newValue) {
        // Forza sempre il fake se autoMute è attivo
        if (settings.store.autoMute && deaf) return true;
        return fakeVoiceState.selfMute;
    },

    // ✅ MODIFICATO: applica SEMPRE i valori fake (no fallback)
    modifyVoiceState(e) {
        e.selfMute = fakeVoiceState.selfMute;
        e.selfDeaf = fakeVoiceState.selfDeaf;
        e.selfVideo = fakeVoiceState.selfVideo;
        return e;
    },

    // ✅ NUOVO: intercetta i cambiamenti di stato Discord
    start() {
        // Hook globale per preservare lo stato fake
        const originalVoiceStateUpdate = findByPropsLazy("voiceStateUpdate")?.voiceStateUpdate;
        if (originalVoiceStateUpdate) {
            const original = originalVoiceStateUpdate;
            originalVoiceStateUpdate.valueOf = () => original;
            
            const wrapped = (...args) => {
                const state = args[0];
                if (state && typeof state === 'object') {
                    this.saveFakeState(state);
                    Object.assign(state, {
                        selfMute: fakeVoiceState.selfMute,
                        selfDeaf: fakeVoiceState.selfDeaf,
                        selfVideo: fakeVoiceState.selfVideo
                    });
                }
                return original(...args);
            };
            wrapped.toString = () => original.toString();
            Object.defineProperty(wrapped, 'name', { value: original.name });
            originalVoiceStateUpdate.valueOf = () => wrapped;
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

    // ✅ PATCH AGGIORNATI per intercettare più punti
    patches: [
        {
            find: "voiceServerPing(){",
            replacement: [
                {
                    match: /voiceStateUpdate\((\w+)\){(.{0,10})guildId:/,
                    replace: "voiceStateUpdate($1){$1=Object.assign($1,{selfMute:$self.fakeVoiceState.selfMute,selfDeaf:$self.fakeVoiceState.selfDeaf,selfVideo:$self.fakeVoiceState.selfVideo});$2guildId:"
                }
            ]
        },
        {
            // Patch per il cambio canale
            find: "selectVoiceChannel",
            replacement: {
                match: /(\w+)\.set\("voice_states",(.+?))/,
                replace: "$1.set(\"voice_states\",$self.saveFakeState($2))"
            }
        },
        {
            // Patch per setSelfMute
            find: "setSelfMute",
            replacement: {
                match: /setSelfMute\([^)]+\)/,
                replace: "setSelfMute($&)&&$self.saveFakeState({selfMute:$self.fakeVoiceState.selfMute})"
            }
        }
    ],

    // ✅ Salva lo stato fake nel plugin store
    settingsAboutToClose() {
        // Persistenza tra riavvii (opzionale)
        Vencord.settings.plugins["FakeMuteAndDeafen"] = {
            selfMute: fakeVoiceState.selfMute,
            selfDeaf: fakeVoiceState.selfDeaf,
            selfVideo: fakeVoiceState.selfVideo
        };
    }
});

// ✅ Inizializza lo stato fake all'avvio
fakeVoiceState.selfMute = Vencord.settings.plugins?.["FakeMuteAndDeafen"]?.selfMute ?? false;
fakeVoiceState.selfDeaf = Vencord.settings.plugins?.["FakeMuteAndDeafen"]?.selfDeaf ?? false;
fakeVoiceState.selfVideo = Vencord.settings.plugins?.["FakeMuteAndDeafen"]?.selfVideo ?? false;
