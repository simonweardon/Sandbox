#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "Interactable.generated.h"

class AVantageCharacter;

UINTERFACE(MinimalAPI)
class UInteractable : public UInterface
{
	GENERATED_BODY()
};

/**
 * Anything the player can put the crosshair on and press E.
 *
 * Deliberately a plain C++ interface rather than a BlueprintNativeEvent one:
 * every implementor in this demo is C++, and the non-virtual dispatch keeps
 * the per-frame focus check in UInteractionProbe cheap.
 */
class IInteractable
{
	GENERATED_BODY()

public:
	/** Line shown under the crosshair while this actor is focused. */
	virtual FText GetInteractionPrompt() const
	{
		return FText::FromString(TEXT("Interact"));
	}

	/** When false the prompt is drawn dimmed and Interact() is never called. */
	virtual bool CanInteract(const AVantageCharacter* Interactor) const
	{
		return true;
	}

	/** Player pressed the interact key while focused on this actor. */
	virtual void Interact(AVantageCharacter* Interactor)
	{
	}
};
