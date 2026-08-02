/*Jest setup shared by every test file.*/
//Each controller and model logs the error it caught before answering with a 
// 500, so the tests that deliberately make the database fail would otherwise
// fill the test output with stack traces that are not failures. The logging is
// silenced here so a red line in the output always means a real problem.

beforeAll(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
    console.error.mockRestore();
});
