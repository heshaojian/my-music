const { jest } = require("@jest/globals");
const reanimated = require("react-native-reanimated/mock");

module.exports = {
    ...reanimated,
    default: {
        ...reanimated.default,
        call: jest.fn(),
    },
};
