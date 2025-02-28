/// <reference lib="dom" />

/*
 * Test that basic SDK usage (init, capture, etc) does not
 * blow up in non-browser (node.js) envs. These are not
 * tests of server-side capturing functionality (which is
 * currently not supported in the browser lib).
 */

import { _copyAndTruncateStrings, loadScript, isCrossDomainCookie, _base64Encode } from '../utils'
import { _info } from '../utils/event-utils'
import { document } from '../utils/globals'
import { _isBlockedUA, DEFAULT_BLOCKED_UA_STRS } from '../utils/blocked-uas'

function userAgentFor(botString: string) {
    const randOne = (Math.random() + 1).toString(36).substring(7)
    const randTwo = (Math.random() + 1).toString(36).substring(7)
    return `Mozilla/5.0 (compatible; ${botString}/${randOne}; +http://a.com/bot/${randTwo})`
}

describe('utils', () => {
    describe('_.copyAndTruncateStrings', () => {
        let target: Record<string, any>

        beforeEach(() => {
            target = {
                key: 'value',
                [5]: 'looongvalue',
                nested: {
                    keeeey: ['vaaaaaalue', 1, 99999999999.4],
                },
            }
        })

        it('truncates objects', () => {
            expect(_copyAndTruncateStrings(target, 5)).toEqual({
                key: 'value',
                [5]: 'looon',
                nested: {
                    keeeey: ['vaaaa', 1, 99999999999.4],
                },
            })
        })

        it('makes a copy', () => {
            const copy = _copyAndTruncateStrings(target, 5)

            target.foo = 'bar'

            expect(copy).not.toEqual(target)
        })

        it('does not truncate when passed null', () => {
            expect(_copyAndTruncateStrings(target, null)).toEqual(target)
        })

        it('handles recursive objects', () => {
            const recursiveObject: Record<string, any> = { key: 'vaaaaalue', values: ['fooobar'] }
            recursiveObject.values.push(recursiveObject)
            recursiveObject.ref = recursiveObject

            expect(_copyAndTruncateStrings(recursiveObject, 5)).toEqual({ key: 'vaaaa', values: ['fooob', undefined] })
        })

        it('handles frozen objects', () => {
            const original = Object.freeze({ key: 'vaaaaalue' })
            expect(_copyAndTruncateStrings(original, 5)).toEqual({ key: 'vaaaa' })
        })
    })

    describe('_.info', () => {
        it('deviceType', () => {
            const deviceTypes = {
                // iPad
                'Mozilla/5.0 (iPad; CPU OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5355d Safari/8536.25':
                    'Tablet',
                // Samsung tablet
                'Mozilla/5.0 (Linux; Android 7.1.1; SM-T555 Build/NMF26X; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/83.0.4103.96 Safari/537.36':
                    'Tablet',
                // Windows Chrome
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.157 Safari/537.36':
                    'Desktop',
                // Mac Safari
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.75.14 (KHTML, like Gecko) Version/7.0.3 Safari/7046A194A':
                    'Desktop',
                // iPhone
                'Mozilla/5.0 (iPhone; CPU iPhone OS 13_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.4 Mobile/15E148 Safari/604.1':
                    'Mobile',
                // LG Android
                'Mozilla/5.0 (Linux; Android 6.0; LG-H631 Build/MRA58K) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/38.0.2125.102 Mobile Safari/537.36':
                    'Mobile',
            }

            for (const [userAgent, deviceType] of Object.entries(deviceTypes)) {
                expect(_info.deviceType(userAgent)).toEqual(deviceType)
            }
        })

        it('properties', () => {
            const properties = _info.properties()

            expect(properties['$lib']).toEqual('web')
            expect(properties['$device_type']).toEqual('Desktop')
        })
    })

    describe('loadScript', () => {
        beforeEach(() => {
            document!.getElementsByTagName('html')![0].innerHTML = ''
        })

        it('should insert the given script before the one already on the page', () => {
            document!.body.appendChild(document!.createElement('script'))
            const callback = jest.fn()
            loadScript('https://fake_url', callback)
            const scripts = document!.getElementsByTagName('script')
            const new_script = scripts[0]

            expect(scripts.length).toBe(2)
            expect(new_script.type).toBe('text/javascript')
            expect(new_script.src).toBe('https://fake_url/')
            const event = new Event('test')
            new_script.onload!(event)
            expect(callback).toHaveBeenCalledWith(undefined, event)
        })

        it("should add the script to the page when there aren't any preexisting scripts on the page", () => {
            const callback = jest.fn()
            loadScript('https://fake_url', callback)
            const scripts = document!.getElementsByTagName('script')

            expect(scripts?.length).toBe(1)
            expect(scripts![0].type).toBe('text/javascript')
            expect(scripts![0].src).toBe('https://fake_url/')
        })

        it('should respond with an error if one happens', () => {
            const callback = jest.fn()
            loadScript('https://fake_url', callback)
            const scripts = document!.getElementsByTagName('script')
            const new_script = scripts[0]

            new_script.onerror!('uh-oh')
            expect(callback).toHaveBeenCalledWith('uh-oh')
        })
    })

    describe('user agent blocking', () => {
        it.each(DEFAULT_BLOCKED_UA_STRS.concat('testington'))(
            'blocks a bot based on the user agent %s',
            (botString) => {
                const randomisedUserAgent = userAgentFor(botString)

                expect(_isBlockedUA(randomisedUserAgent, ['testington'])).toBe(true)
            }
        )

        it.each([
            [
                'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/W.X.Y.Z Safari/537.36',
            ],
            ['AhrefsSiteAudit (Desktop) - Mozilla/5.0 (compatible; AhrefsSiteAudit/6.1; +http://ahrefs.com/robot/)'],
            ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.0; +https://openai.com/gptbot)'],
        ])('blocks based on user agent', (botString) => {
            expect(_isBlockedUA(botString, [])).toBe(true)
            expect(_isBlockedUA(botString.toLowerCase(), [])).toBe(true)
            expect(_isBlockedUA(botString.toUpperCase(), [])).toBe(true)
        })
    })

    describe('check for cross domain cookies', () => {
        it.each([
            [false, 'https://test.herokuapp.com'],
            [false, 'test.herokuapp.com'],
            [false, 'herokuapp.com'],
            [false, undefined],
            // ensure it isn't matching herokuapp anywhere in the domain
            [true, 'https://test.herokuapp.com.impersonator.io'],
            [true, 'mysite-herokuapp.com'],
            [true, 'https://bbc.co.uk'],
            [true, 'bbc.co.uk'],
            [true, 'www.bbc.co.uk'],
        ])('should return %s when hostname is %s', (expectedResult, hostname) => {
            expect(isCrossDomainCookie({ hostname } as unknown as Location)).toEqual(expectedResult)
        })
    })

    describe('base64Encode', () => {
        it('should return null when input is null', () => {
            expect(_base64Encode(null)).toBe(null)
        })

        it('should return undefined when input is undefined', () => {
            expect(_base64Encode(undefined)).toBe(undefined)
        })

        it('should return base64 encoded string when input is a string', () => {
            const input = 'Hello, World!'
            const expectedOutput = 'SGVsbG8sIFdvcmxkIQ==' // Base64 encoded string of 'Hello, World!'
            expect(_base64Encode(input)).toBe(expectedOutput)
        })

        it('should handle special characters correctly', () => {
            const input = '✓ à la mode'
            const expectedOutput = '4pyTIMOgIGxhIG1vZGU=' // Base64 encoded string of '✓ à la mode'
            expect(_base64Encode(input)).toBe(expectedOutput)
        })

        it('should handle empty string correctly', () => {
            const input = ''
            const expectedOutput = '' // Base64 encoded string of an empty string is an empty string
            expect(_base64Encode(input)).toBe(expectedOutput)
        })
    })
})
