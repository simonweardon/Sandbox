// Copyright Epic Games, Inc. All Rights Reserved.

using UnrealBuildTool;

public class VantageTarget : TargetRules
{
	public VantageTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_4;

		ExtraModuleNames.Add("Vantage");
	}
}
