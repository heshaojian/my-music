const { cleanup } = require("@testing-library/react-native");
const { afterEach, jest } = require("@jest/globals");

jest.mock("react-native-reanimated", () =>
    require("./src/test/mocks/reactNativeReanimated"),
);

afterEach(() => {
    cleanup();
});
