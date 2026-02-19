import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getUserSetting,
    saveUserSetting,
    deleteUserSetting,
    getSetupState,
    saveSetupState,
    clearSetupState
} from './user';
import type { UserSetting, SetupState } from '../types';

describe('User Store', () => {
    let mockKV: any;

    beforeEach(() => {
        mockKV = {
            get: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
        };
    });

    describe('getUserSetting', () => {
        it('should return user setting when it exists', async () => {
            const mockSetting: UserSetting = {
                homeStop: { id: '1', name: 'Home' },
                workStop: { id: '2', name: 'Work' },
                matchedRoutes: [],
                switchHour: 12
            };
            mockKV.get.mockResolvedValue(mockSetting);

            const result = await getUserSetting(mockKV, 123);
            expect(result).toEqual(mockSetting);
            expect(mockKV.get).toHaveBeenCalledWith('user:123', 'json');
        });

        it('should return null when setting does not exist', async () => {
            mockKV.get.mockResolvedValue(null);

            const result = await getUserSetting(mockKV, 123);
            expect(result).toBeNull();
            expect(mockKV.get).toHaveBeenCalledWith('user:123', 'json');
        });
    });

    describe('saveUserSetting', () => {
        it('should save user setting to KV', async () => {
            const mockSetting: UserSetting = {
                homeStop: { id: '1', name: 'Home' },
                workStop: { id: '2', name: 'Work' },
                matchedRoutes: [],
                switchHour: 12
            };

            await saveUserSetting(mockKV, 123, mockSetting);
            expect(mockKV.put).toHaveBeenCalledWith(
                'user:123',
                JSON.stringify(mockSetting)
            );
        });
    });

    describe('deleteUserSetting', () => {
        it('should delete user setting and setup state from KV', async () => {
            await deleteUserSetting(mockKV, 123);
            expect(mockKV.delete).toHaveBeenCalledWith('user:123');
            expect(mockKV.delete).toHaveBeenCalledWith('setup:123');
        });
    });

    describe('getSetupState', () => {
        it('should return setup state when it exists', async () => {
            const mockState: SetupState = { step: 'select_home' };
            mockKV.get.mockResolvedValue(mockState);

            const result = await getSetupState(mockKV, 123);
            expect(result).toEqual(mockState);
            expect(mockKV.get).toHaveBeenCalledWith('setup:123', 'json');
        });

        it('should return null when setup state does not exist', async () => {
            mockKV.get.mockResolvedValue(null);

            const result = await getSetupState(mockKV, 123);
            expect(result).toBeNull();
            expect(mockKV.get).toHaveBeenCalledWith('setup:123', 'json');
        });
    });

    describe('saveSetupState', () => {
        it('should save setup state to KV with expiration', async () => {
            const mockState: SetupState = { step: 'select_home' };

            await saveSetupState(mockKV, 123, mockState);
            expect(mockKV.put).toHaveBeenCalledWith(
                'setup:123',
                JSON.stringify(mockState),
                { expirationTtl: 600 }
            );
        });
    });

    describe('clearSetupState', () => {
        it('should delete setup state from KV', async () => {
            await clearSetupState(mockKV, 123);
            expect(mockKV.delete).toHaveBeenCalledWith('setup:123');
        });
    });
});
