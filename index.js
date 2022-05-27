const {getInput, info, warning, setFailed} = require('@actions/core');
const {getOctokit} = require('@actions/github');
const FS = require('fs');
const Path = require('path');

async function main() {
	try {
		let now = new Date();
		let currentWeekNumber = getWeekNumber(now);
		
		let [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
		
		let gh = getOctokit(getInput('token'));
		let workflowId = (await gh.rest.actions.getWorkflowRun({
			owner,
			repo,
			run_id: process.env.GITHUB_RUN_ID
		})).data.workflow_id;
		
		let runs = (await gh.rest.actions.listWorkflowRuns({
			owner,
			repo,
			workflow_id: workflowId
		})).data.workflow_runs
			.map(run => ({number: run.run_number, date: new Date(run.created_at)}))
			.filter(run => getWeekNumber(run.date) == currentWeekNumber);
		
		let firstRunNumberOfWeek = process.env.GITHUB_RUN_NUMBER;
		if (runs.length > 0) {
			firstRunNumberOfWeek = runs[runs.length - 1].number;
		}
		
		let buildId = process.env.GITHUB_RUN_NUMBER - firstRunNumberOfWeek;
		let versionWithoutMajor = `${now.getFullYear() % 100}.${currentWeekNumber}.${buildId}`;
		
		// Now we need to put that version into all applicable AssemblyInfo.cs files
		let directories = FS.readdirSync(process.env.GITHUB_WORKSPACE);
		let projects = directories.filter(dir => FS.existsSync(Path.join(process.env.GITHUB_WORKSPACE, dir, 'Properties', 'AssemblyInfo.cs')));
		projects.forEach((projectDir) => {
			let filePath = Path.join(process.env.GITHUB_WORKSPACE, projectDir, 'Properties', 'AssemblyInfo.cs');
			let assemblyInfo = FS.readFileSync(filePath, {encoding: 'utf8'});
			let versionLine = assemblyInfo.match(/(^|\r\n|\n)(\[assembly: AssemblyVersion\([^)]+\)])($|\r\n|\n |\t)/);
			if (!versionLine) {
				warning(`Cannot find version line in ${filePath}`);
				return;
			}
			
			versionLine = versionLine[2];
			let majorVersion = versionLine.match(/"(\d+)\./);
			if (!majorVersion) {
				warning(`Cannot find major version in version line ${versionLine} in ${filePath}`);
				return;
			}
			
			let version = `${majorVersion}.${versionWithoutMajor}`;
			info(`Setting version ${version} in ${filePath}`);
			assemblyInfo = assemblyInfo.replace(versionLine, `[assembly: AssemblyVersion("${version}")]`);
			FS.writeFileSync(filePath, assemblyInfo);
		});
	} catch (ex) {
		setFailed(ex.message);
	}
}

main();

function getWeekNumber(date) {
	date = date || new Date();
	let jan1 = new Date(date.getFullYear(), 0, 1);
	let days = Math.ceil((date - jan1) / (1000 * 60 * 60 * 24));
	return Math.ceil(days / 7);
}

