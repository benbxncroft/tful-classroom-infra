module.exports = {
    root: true,
    parserOptions: {
        parser: '@typescript-eslint/parser',
        "ecmaFeatures": {
            "legacyDecorators": true
        }
    },
    extends: [
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended'
    ],
    // add your custom rules here
    rules: {
        "indent": ["error", 4],
        "semi": ["error", "always"],
        "quotes": 0,
        "eqeqeq": ["error", "always"],
        "curly": "error",
        "arrow-body-style": ["error", "always"],
        "arrow-parens": ["error", "always"],
        "@typescript-eslint/type-annotation-spacing": ['error', {
            before: false,
            after: true,
        }],
        "@typescript-eslint/no-inferrable-types": 0
    },
    plugins: [
        '@typescript-eslint',
    ],
}
