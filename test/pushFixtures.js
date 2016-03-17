exports.updateOneBranch =
`
refs/heads/funny 2ef3aededbe057ea3c57586c24bccba53d056163 refs/heads/funny b71d14585c3d2420af8caac30c0e0f7d81b9b44d
`;

exports.createTwoBranches =
`
refs/heads/funny b71d14585c3d2420af8caac30c0e0f7d81b9b44d refs/heads/funny 0000000000000000000000000000000000000000
refs/heads/pr-worse b71d14585c3d2420af8caac30c0e0f7d81b9b44d refs/heads/pr-worse 0000000000000000000000000000000000000000
`;

exports.createBranch =
`
refs/heads/funny b71d14585c3d2420af8caac30c0e0f7d81b9b44d refs/heads/funny 0000000000000000000000000000000000000000
`;

exports.deleteBranch =
`
(delete) 0000000000000000000000000000000000000000 refs/heads/funny 2ef3aededbe057ea3c57586c24bccba53d056163
`;

exports.pushTags = 
`
refs/tags/foo c0475dde4d7105a0dd025abb0e699060ee693b39 refs/tags/foo 0000000000000000000000000000000000000000
`
