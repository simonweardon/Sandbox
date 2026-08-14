// Copyright Epic Games, Inc. All Rights Reserved.

using UnrealBuildTool;

public class VantageEditorTarget : TargetRules
{
	public VantageEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;

		ExtraModuleNames.Add("Vantage");
	}
}
