import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { type infer as zInfer, object, string } from 'zod';
import { option } from 'pastel';
import { apiCall } from '../lib/api.js';
import {
	authCallbackServer,
	browserAuth,
	saveAuthToken,
	TokenType,
	tokenType,
} from '../lib/auth.js';

export const options = object({
	key: string()
		.optional()
		.describe(
			option({
				description: 'Use API key instead of user authentication',
				alias: 'k',
			}),
		),
	workspace: string()
		.optional()
		.describe(
			option({
				description: 'Use predefined workspace to Login',
			}),
		),
});

type Org = {
	label: string;
	value: string;
};

type Project = {
	label: string;
	value: string;
};

type Environment = {
	label: string;
	value: string;
};

type Props = {
	readonly options: zInfer<typeof options>;
};

export default function Login({ options: { key, workspace } }: Props) {
	const [authError, setAuthError] = useState<string>('');
	const [orgs, setOrgs] = useState<Org[]>([]);
	const [accessToken, setAccessToken] = useState<string | undefined>();
	const [cookie, setCookie] = useState<string | undefined>('');
	const [activeOrg, setActiveOrg] = useState<Org | null>(null);
	const [activeProject, setActiveProject] = useState<Project | null>(null);
	const [activeEnvironment, setActiveEnvironment] =
		useState<Environment | null>(null);
	const [projects, setProjects] = useState<Project[]>([]);
	const [environments, setEnvironments] = useState<Environment[]>([]);
	const [state, setState] = useState<
		'login' | 'loggingIn' | 'org' | 'project' | 'environment' | 'done'
	>('login');

	useEffect(() => {
		const fetchOrgs = async () => {
			const { response: orgs } = await apiCall(
				'v2/orgs',
				accessToken ?? '',
				cookie,
			);


			const selectedOrg = Array.isArray(orgs)
				? orgs.find(
						(org: { key: string }) => workspace && org.key === workspace,
					)
				: null;

			if (selectedOrg) {
				setActiveOrg({ label: selectedOrg.name, value: selectedOrg.id });
				setState('project');
			} else if (Array.isArray(orgs) && orgs.length === 1) {
				setActiveOrg({ label: orgs[0].name, value: orgs[0].id });
				setState('project');
			}

			setOrgs(
				Array.isArray(orgs)
					? orgs.map((org: { name: string; id: string }) => ({
							label: org.name,
							value: org.id,
						}))
					: [],
			);
		};

		if (state === 'org' && accessToken) {
			fetchOrgs();
		}
	}, [state, accessToken, cookie, workspace]);

	useEffect(() => {
		const fetchProjects = async () => {
			let newCookie = cookie ?? '';

			const { headers } = await apiCall(
				`v2/auth/switch_org/${activeOrg?.value}`,
				accessToken ?? '',
				cookie ?? '',
				'POST',
			);

			newCookie = headers.getSetCookie()[0] ?? '';
			setCookie(newCookie);

			const { response: projects } = await apiCall(
				'v2/projects',
				accessToken ?? '',
				newCookie,
			);

			if (Array.isArray(projects) && projects.length === 1) {
				setActiveProject({ label: projects[0].name, value: projects[0].id });
				setState('environment');
			}

			setProjects(
				Array.isArray(projects)
					? projects.map((project: { name: string; id: string }) => ({
							label: project.name,
							value: project.id,
						}))
					: [],
			);
		};

		if (activeOrg) {
			fetchProjects();
		}
	}, [activeOrg, accessToken, cookie]);

	useEffect(() => {
		const fetchEnvironments = async () => {
			const { response: environments } = await apiCall(
				`v2/projects/${activeProject?.value}/envs`,
				accessToken ?? '',
				cookie ?? '',
			);
			setEnvironments(
				Array.isArray(environments)
					? environments.map((environment: { name: string; id: string }) => ({
							label: environment.name,
							value: environment.id,
						}))
					: [],
			);
		};

		if (activeProject) {
			fetchEnvironments();
		}
	}, [activeProject, accessToken, cookie]);

	useEffect(() => {
		if (state === 'done') {
			process.exit(0);
		}
	}, [state]);

	const handleOrgSelect = async (org: Org) => {
		setActiveOrg(org);
		setState('project');
	};

	useEffect(() => {
		const authenticateUser = async () => {
			setState('loggingIn');
			if (key && tokenType(key) === TokenType.APIToken) {
				setAccessToken(key);
			} else if (key) {
				setAuthError('Invalid API Key');
				setState('done');
			} else {
				// Open the authentication URL in the default browser
				const verifier = await browserAuth();
				const token = await authCallbackServer(verifier);
				const { headers } = await apiCall(
					'v2/auth/login',
					token ?? '',
					'',
					'POST',
				);
				setAccessToken(token);
				setCookie(headers.getSetCookie()[0]);
			}

			setState('org');
		};

		authenticateUser();
	}, [key]);

	return (
		<>
			{state === 'login' && <Text>Login to Permit</Text>}
			{state === 'loggingIn' && (
				<Text>
					<Spinner type="dots" /> Logging in...
				</Text>
			)}
			{state === 'org' &&
				(orgs && orgs.length > 0 ? (
					<>
						<Text>Select an organization</Text>
						<SelectInput items={orgs} onSelect={handleOrgSelect} />
					</>
				) : (
					<Text>
						<Spinner type="dots" /> Loading Organizations
					</Text>
				))}
			{state === 'project' &&
				(projects && projects.length > 0 ? (
					<>
						<Text>Select a project</Text>
						<SelectInput
							items={projects}
							onSelect={project => {
								setActiveProject(project);
								setState('environment');
							}}
						/>
					</>
				) : (
					<Text>
						<Spinner type="dots" /> Loading Projects
					</Text>
				))}
			{state === 'environment' &&
				(environments && environments.length > 0 ? (
					<>
						<Text>Select an environment</Text>
						<SelectInput
							items={environments}
							onSelect={async environment => {
								setActiveEnvironment(environment);
								const { response } = await apiCall(
									`v2/api-key/${activeProject?.value}/${environment.value}`,
									accessToken ?? '',
									cookie,
								);
								const { secret } = response as { secret: string };
								await saveAuthToken(secret);
								setState('done');
							}}
						/>
					</>
				) : (
					<Text>
						<Spinner type="dots" /> Loading Environments
					</Text>
				))}
			{state === 'done' && activeOrg && (
				<Text>
					Logged in as {activeOrg.label} with selected environment as{' '}
					{activeEnvironment ? activeEnvironment.label : 'None'}
				</Text>
			)}
			{state === 'done' && authError && <Text>{authError}</Text>}
		</>
	);
}
